'use client';

import Script from 'next/script';
import { createElement } from 'react';

const DEFAULT_AGENT_ID = 'agent_8701kn5dmzsae13bh6x9hv97rj7k';

/** Embeds the ElevenLabs ConvAI test widget (floating UI loads after the script). */
export function ElevenLabsConvaiWidget() {
  const agentId = process.env.NEXT_PUBLIC_ELEVENLABS_AGENT_ID ?? DEFAULT_AGENT_ID;

  return (
    <>
      <Script
        src="https://unpkg.com/@elevenlabs/convai-widget-embed"
        strategy="afterInteractive"
      />
      <div className="convai-widget-wrap">
        {createElement('elevenlabs-convai', { 'agent-id': agentId })}
      </div>
    </>
  );
}
