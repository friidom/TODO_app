const B = process.argv[2] ?? "http://localhost:3000/api/v1";
const [identifier, password] = [
  process.env.SMOKE_USER ?? "superadmin@gmail.com",
  process.env.SMOKE_PASS ?? "123123123123",
];
let token;
const req = async (m, p, body) => {
  const r = await fetch(B + p, {
    method: m,
    headers: {
      "content-type": "application/json",
      ...(token && { authorization: `Bearer ${token}` }),
    },
    body: body && JSON.stringify(body),
  });
  const t = await r.text();
  let j;
  try {
    j = JSON.parse(t);
  } catch {
    j = t;
  }
  return { s: r.status, j };
};
const ok = (name, cond, extra = "") =>
  console.log(cond ? "PASS" : "FAIL", name, extra);
const login = await req("POST", "/auth/login", { identifier, password });
token = login.j.accessToken ?? login.j.access_token ?? login.j.token;
ok("login", login.s === 200 && !!token, login.s);
const boards = await req("GET", "/boards");
const board = (
  Array.isArray(boards.j) ? boards.j : (boards.j.boards ?? boards.j.items)
)[0];
ok("boards", !!board?.id);
ok("star", (await req("PUT", `/boards/${board.id}/star`)).s === 200);
const starred = await req("GET", "/me/starred");
ok("starred lists board", JSON.stringify(starred.j).includes(board.id));
const todos = await req("GET", `/boards/${board.id}/todos`);
const todo = todos.j[0];
ok("todos carry labels", Array.isArray(todo.labels));
ok(
  "add '..'",
  (
    await req("POST", `/todos/${todo.id}/labels`, { name: ".." })
  ).j.labels?.includes(".."),
);
const rm = await req(
  "DELETE",
  `/todos/${todo.id}/labels?name=${encodeURIComponent("..")}`,
);
ok("remove '..'", rm.s === 200 && !rm.j.labels.includes(".."), rm.s);
ok("todo still exists", (await req("GET", `/todos/${todo.id}`)).s === 200);
const hist = await req("GET", `/todos/${todo.id}/activities`);
ok(
  "labels_changed in history",
  JSON.stringify(hist.j).includes("labels_changed"),
);
const c = await req("POST", `/todos/${todo.id}/comments`, {
  content: "smoke pin",
});
const cid = c.j.id;
ok("comment", c.s === 201 || c.s === 200, c.s);
ok("pin comment", (await req("PUT", `/comments/${cid}/pin`)).s < 300);
const cs = await req("GET", `/todos/${todo.id}/comments`);
ok("pinned_at returned", !!cs.j.find?.((x) => x.id === cid)?.pinned_at);
ok("unstar", (await req("DELETE", `/boards/${board.id}/star`)).s < 300);
ok("unpin", (await req("DELETE", `/comments/${cid}/pin`)).s < 300);
ok("delete smoke comment", (await req("DELETE", `/comments/${cid}`)).s < 300);
