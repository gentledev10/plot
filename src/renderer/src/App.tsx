export function App() {
  return (
    <div className={`app platform-${window.viewer.platform}`}>
      <aside className="sidebar">
        <header className="pane-header">Pull requests</header>
        <p className="empty">No pull requests yet.</p>
      </aside>
      <main className="workspace">
        <p className="empty">Select a pull request to start reviewing.</p>
      </main>
      <aside className="review-panel">
        <header className="pane-header">AI review</header>
        <p className="empty">Run an AI review to see the change map.</p>
      </aside>
    </div>
  );
}
