// All OpenAI calls are made directly from the browser using the user's own
// key (§45) — there is no shared developer key anywhere in this codebase,
// and none of these functions do anything without a key the user typed in
// themselves. Every function here is additive: the whole app already works
// with none of this ever being called (§43).

const CHAT_MODEL = 'gpt-4o-mini';

export async function testOpenAIConnection(apiKey) {
  if (!apiKey) return { ok: false, error: 'No API key entered.' };
  try {
    const res = await fetch('https://api.openai.com/v1/models', {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (res.ok) return { ok: true };
    if (res.status === 401) return { ok: false, error: 'That key was rejected by OpenAI.' };
    return { ok: false, error: `OpenAI returned an error (${res.status}).` };
  } catch (e) {
    return { ok: false, error: "Couldn't reach OpenAI. Check your connection." };
  }
}

async function chatJSON(apiKey, systemPrompt, userPrompt) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: CHAT_MODEL,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.2,
    }),
  });
  if (!res.ok) throw new Error(`OpenAI request failed (${res.status})`);
  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('OpenAI returned an empty response.');
  return JSON.parse(content);
}

// §44: natural-language -> proposed obligation fields. Returns a plain
// object the caller MUST show to the user for review before creating
// anything — this function never writes to Firestore itself.
const PARSE_SYSTEM_PROMPT = `You convert a short description of a recurring bill into structured JSON for a financial obligations tracker called clear'd.
Return ONLY a JSON object with these keys (use null for anything not mentioned):
name (string), amountType ("fixed"|"variable"), fixedAmount (number|null), typicalMin (number|null), typicalMax (number|null),
frequency ("monthly"|"weekly"|"yearly"), paymentMethod ("bank_transfer"|"giro"|"gxs"|"axs"|"paynow"|"cash"|"other"),
dueDayOfMonth (integer 1-31|null), collectionDayOfMonth (integer 1-31|null), notes (string|null).
Never invent an amount or date that wasn't stated or clearly implied.`;

export async function parseObligationFromText(apiKey, text) {
  return chatJSON(apiKey, PARSE_SYSTEM_PROMPT, text);
}

// §44: monthly review summary. Receives only this month's and last month's
// already-aggregated numbers for the current user — never raw obligation
// lists beyond what's needed, and never another user's data (the caller is
// responsible for scoping input to the signed-in user, same as every other
// AI entry point).
const REVIEW_SYSTEM_PROMPT = `You are a calm, factual assistant inside a financial obligations tracker called clear'd.
Given this month's and last month's obligation totals, write a 2-3 sentence plain-English summary of what changed and why, if inferable.
Return ONLY a JSON object: { "summary": string }. Never invent figures not present in the input.`;

export async function summarizeMonth(apiKey, currentMonthData, previousMonthData) {
  const prompt = JSON.stringify({ currentMonth: currentMonthData, previousMonth: previousMonthData });
  const result = await chatJSON(apiKey, REVIEW_SYSTEM_PROMPT, prompt);
  return result.summary || '';
}

// §44: contextual Q&A ("which obligations end this year?" etc). `context`
// is the caller-prepared, already-scoped-to-this-user obligation/instance
// summary — this function has no independent access to Firestore.
const QUESTION_SYSTEM_PROMPT = `You answer questions about the signed-in user's own financial obligations for the clear'd. app, using ONLY the JSON context provided.
Never claim knowledge beyond that context. Return ONLY a JSON object: { "answer": string }.`;

export async function answerQuestion(apiKey, context, question) {
  const prompt = JSON.stringify({ context, question });
  const result = await chatJSON(apiKey, QUESTION_SYSTEM_PROMPT, prompt);
  return result.answer || '';
}
