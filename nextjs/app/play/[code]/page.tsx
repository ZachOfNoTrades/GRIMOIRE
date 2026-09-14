import PlayClient from "./PlayClient";

// Public Damnation controller for a guest's phone. middleware.ts excludes /play/ from the
// sign-in gate on purpose — guests have no account. Everything the page does is authorized by
// the join code (to take a seat) and then by the X-Damnation-Token issued for that seat.

export default async function PlayPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <PlayClient code={code.toUpperCase()} />;
}
