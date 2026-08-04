import { useState } from "react";
import "./styles/global.css";
import Layout from "./components/layout/Layout";
import TodoPage from "./components/pages/TodoPage";
import CreateColumnModal from "./components/columns/CreateColumnModal";
import KanbanBoard from "./components/kanban/KanbanBoard";

function App() {
  const [createColumnOpen, setCreateColumnOpen] = useState(false);

  // const { user, loading } = useAuth();

  return (
    <TodoPage>
      <Layout>
        {/* //Form  */}
        <div className="mx-auto mb-8 max-w-2xl">My Kanban Project</div>
        {/* // drag and drop  */}
        <KanbanBoard />
      </Layout>
      {/* <CreateColumnModal
        open={createColumnOpen}
        onClose={() => setCreateColumnOpen(false)}
      /> */}
    </TodoPage>
  );
}

export default App;
