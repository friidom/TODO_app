import { parseArgs } from "node:util";

import { closePool } from "../db/client.js";
import { bootstrapSuperadmin } from "../modules/admin/admin.service.js";

// Appoints the FIRST superadmin, from a shell on the server. Refuses once an
// active superadmin exists; from then on the role is granted in the admin
// panel, by someone who already holds it.
//
//   node dist/cli/bootstrapSuperadmin.js --email someone@example.com
//     previews the account and prints its id; changes nothing
//   node dist/cli/bootstrapSuperadmin.js --email someone@example.com --confirm <id>
//     grants the role if that id is the account the email names
//
// Exit codes: 0 done or nothing to do, 1 refused, 2 usage.

const USAGE = "usage: bootstrapSuperadmin --email <address> [--confirm <user-id>]";

async function main(): Promise<number> {
  const { values } = parseArgs({
    options: { email: { type: "string" }, confirm: { type: "string" } },
    strict: true,
  });

  if (!values.email) {
    console.error(USAGE);

    return 2;
  }

  const result = await bootstrapSuperadmin(values.email, values.confirm);

  switch (result.kind) {
    case "no_account":
      console.error("No account has that email. The person must register first.");

      return 1;

    case "mismatch":
      console.error("That id is not the account this email names. Nothing changed.");

      return 1;

    case "refused":
      console.error(`Refused: ${result.message} Nothing changed.`);

      return 1;

    case "preview": {
      const { account } = result;

      console.log(`account   ${account.id}`);
      console.log(`username  ${account.username ?? "-"}`);
      console.log(`status    ${account.status}`);
      console.log(`role      ${account.org_role}`);
      console.log(`active superadmins now: ${result.activeSuperadmins}`);
      console.log("");
      console.log("Nothing changed. If this is the right person, run again with:");
      console.log(`  --email ${values.email} --confirm ${account.id}`);

      return 0;
    }

    case "done":
      console.log(
        result.outcome === "unchanged"
          ? `${result.account.username ?? result.account.id} is already a superadmin. Nothing changed.`
          : `${result.account.username ?? result.account.id} is now a superadmin. Recorded in admin_audit_log.`,
      );

      return 0;
  }
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => closePool());
