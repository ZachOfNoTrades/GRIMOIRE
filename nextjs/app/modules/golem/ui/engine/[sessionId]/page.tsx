import EngineGeneratePanel from '../../../components/EngineGeneratePanel';

// Self-contained page for triggering deterministic engine generation for a session and reviewing the plan.
export default async function EngineGeneratePage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;

  return (
    /* ENGINE GENERATION PAGE */
    <div className="card-content">
      {/* PAGE HEADER */}
      <h2 className="text-card-title">Engine Session Generation</h2>

      {/* GENERATE PANEL */}
      <EngineGeneratePanel sessionId={sessionId} />
    </div>
  );
}
