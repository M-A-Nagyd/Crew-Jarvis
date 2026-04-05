/** Voice UI lines — one random line per interaction where noted */

export const WELCOME_LINES = [
  'Welcome back, sir.',
  'Good to see you. Systems are online.',
  'At your service.',
  'Ready when you are.',
  'All interfaces nominal. Welcome.',
  'Shall we begin?',
  'Standing by.',
  'Neural link stable. Welcome.',
]

export const INVITE_LINES = [
  'Describe your project in detail. When you are finished, clap once to continue.',
  'Walk me through what you want to build. A single clap when you are done will signal completion.',
  'Tell me the full scope of your task. Clap once when you have said everything.',
  'I am ready for your brief. Speak freely, then clap once to proceed.',
  'Outline your requirements. When your explanation is complete, clap once.',
  'Give me the specification. A clap will mark the end of your statement.',
]

export const CLARIFY_INTRO_LINES = [
  'I have follow-up questions. Answer each after I speak. Clap when you have finished your answer.',
  'A few clarifications remain. Respond after each question. Clap once when you are done answering.',
  'I will ask questions one at a time. Answer verbally, then clap to confirm you are finished.',
]

export function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)]
}
