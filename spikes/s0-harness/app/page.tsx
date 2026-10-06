import { auth, signIn, signOut } from "@/auth";

export default async function HomePage() {
  const session = await auth();

  if (!session?.user) {
    return (
      <main>
        <h1>Podcast Studio — Spike S0</h1>
        <p>Google Sign-In hello-world (not Phase 1 product).</p>
        <form
          action={async () => {
            "use server";
            await signIn("google");
          }}
        >
          <button type="submit">Sign in with Google</button>
        </form>
      </main>
    );
  }

  return (
    <main>
      <h1>Podcast Studio — Spike S0</h1>
      <p>Signed in as <strong>{session.user.email}</strong></p>
      <p>
        Mock episode role:{" "}
        <strong>{session.mockRole}</strong>{" "}
        <span style={{ color: "#666" }}>
          (inject via SPIKE_MOCK_ROLE or SPIKE_ROLE_BY_EMAIL)
        </span>
      </p>
      <form
        action={async () => {
          "use server";
          await signOut();
        }}
      >
        <button type="submit">Sign out</button>
      </form>
    </main>
  );
}
