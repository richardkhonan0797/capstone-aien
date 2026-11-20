// Run inside the n8n container. Checks the real token -> Realtime -> store tool
// -> generated audio path, without a microphone or exposing credentials.
const tokenResponse = await fetch('http://127.0.0.1:5678/webhook/realtime-token', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
if (!tokenResponse.ok) throw new Error(`Token HTTP ${tokenResponse.status}`);
const token = await tokenResponse.json();
if (!token.value) throw new Error('No token');
const ws = new WebSocket(`wss://api.openai.com/v1/realtime?model=${encodeURIComponent(token.model)}`, ['realtime', `openai-insecure-api-key.${token.value}`]);
let tools = 0, audio = 0, transcript = '', submitted = false, finished = false;
const timeout = setTimeout(() => finish(false, 'Timed out waiting for realtime answer'), 150000);
function finish(ok, message) {
  if (finished) return;
  finished = true; clearTimeout(timeout); ws.close();
  console.log(JSON.stringify({ ok, tool_calls: tools, audio_chunks: audio, transcript, message }));
  process.exitCode = ok ? 0 : 1;
}
function send(event) { ws.send(JSON.stringify(event)); }
ws.onerror = () => finish(false, 'Realtime WebSocket connection failed');
ws.onmessage = async ({ data }) => {
  try {
    const event = JSON.parse(data);
    if (event.type === 'error') return finish(false, `${event.error?.code || 'error'}: ${event.error?.message || ''}`);
    if (event.type === 'session.created' && !submitted) {
      submitted = true;
      send({ type: 'conversation.item.create', item: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'Berapa harga dan stok Tas Ransel Harian Hitam?' }] } });
      send({ type: 'response.create' });
    }
    if (event.type === 'response.output_audio.delta') audio++;
    if (event.type === 'response.output_audio_transcript.delta') transcript += event.delta;
    if (event.type === 'response.done') {
      if (event.response.status !== 'completed') return finish(false, 'Response did not complete');
      let called = false;
      for (const item of event.response.output || []) {
        if (item.type !== 'function_call') continue;
        if (item.name !== 'tanya_toko' || tools++) return finish(false, 'Unexpected or repeated tool call');
        const args = JSON.parse(item.arguments);
        const result = await fetch('http://127.0.0.1:5678/webhook/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: args.pesan, session_id: 'voice-smoke-' + Date.now() }), signal: AbortSignal.timeout(120000) });
        if (!result.ok) return finish(false, `Chat HTTP ${result.status}`);
        const reply = await result.json();
        if (!reply.jawaban || !reply.sumber?.length || reply.validasi !== 'ok') return finish(false, 'Store answer missing valid sources');
        console.log(JSON.stringify({ backend_answer: reply.jawaban, sources: reply.sumber }));
        send({ type: 'conversation.item.create', item: { type: 'function_call_output', call_id: item.call_id, output: JSON.stringify(reply) } });
        called = true;
      }
      if (called) send({ type: 'response.create' });
      else finish(tools === 1 && audio > 0, 'Generated audio after catalog lookup');
    }
  } catch (error) { finish(false, error.message); }
};
