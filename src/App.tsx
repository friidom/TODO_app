import "./styles/global.css";
import Layout from "./components/layout/Layout";
import TodoPage from "./components/pages/TodoPage";
import KanbanBoard from "./components/kanban/KanbanBoard";

function App() {
  return (
    <TodoPage>
      <Layout>
        {/* //Form  */}
        <div className="mx-auto mb-8 max-w-2xl">My Kanban Project</div>
        {/* // drag and drop  */}
        <KanbanBoard />
      </Layout>
    </TodoPage>
  );
}

export default App;
