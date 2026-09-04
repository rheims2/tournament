/**
 * Shown until VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are set, so a fresh
 * checkout explains itself instead of failing with a network error.
 */
export function SetupPage() {
  return (
    <div className="app">
      <header className="topbar">
        <h1>Volleyball Tournament</h1>
      </header>
      <main>
        <div className="card">
          <h2>Finish setup</h2>
          <p className="small muted">
            This app needs a Supabase project to store the tournament. It takes about five minutes.
          </p>
          <ol className="small" style={{ paddingLeft: 18, lineHeight: 1.9 }}>
            <li>
              Create a free project at <code>supabase.com</code>.
            </li>
            <li>
              Open the SQL editor and run <code>supabase/migrations/0001_init.sql</code> from this
              repository.
            </li>
            <li>
              Copy <code>.env.example</code> to <code>.env</code> and paste in the project URL and
              anon key from <em>Project Settings → API</em>.
            </li>
            <li>
              Restart <code>npm run dev</code>, then sign up. <strong>The first account created
              becomes the admin.</strong>
            </li>
          </ol>
          <p className="tiny muted">See README.md for the full walkthrough.</p>
        </div>
      </main>
    </div>
  )
}
