# Resonance: A Legacy Campaign

A two-player narrative RPG for Matt & Michelle. Open on your phones, speak your actions, the GM responds.

---

## One-Time Setup (~15 minutes)

You need three free accounts. All are genuinely free — no credit card.

### Step 1 — Get your free AI key (Google Gemini)

1. Go to **aistudio.google.com** (sign in with your Google account)
2. Click **"Get API key"** in the left sidebar
3. Click **"Create API key"** → **"Create API key in new project"**
4. Copy the key (looks like `AIzaSy...`) — save it somewhere temporarily

### Step 2 — Get your free database (Upstash Redis)

This remembers your campaign between sessions.

1. Go to **upstash.com** → click **"Sign Up"** → sign in with GitHub
2. Click **"Create Database"**
3. Name it `resonance`, choose any region, leave defaults → **"Create"**
4. On the database page, scroll to **"REST API"** section
5. Copy the **UPSTASH_REDIS_REST_URL** and **UPSTASH_REDIS_REST_TOKEN** — save these

### Step 3 — Deploy to Vercel (from GitHub)

1. Push this folder to a GitHub repository:
   - Go to github.com → **"New repository"** → name it `resonance-dnd`
   - Upload these files (or use GitHub Desktop)

2. Go to **vercel.com** → **"Sign Up"** → **"Continue with GitHub"**

3. Click **"Add New Project"** → find your `resonance-dnd` repo → click **"Import"**

4. Before clicking Deploy, click **"Environment Variables"** and add these three:

   | Name | Value |
   |------|-------|
   | `GEMINI_API_KEY` | the key from Step 1 |
   | `UPSTASH_REDIS_REST_URL` | the URL from Step 2 |
   | `UPSTASH_REDIS_REST_TOKEN` | the token from Step 2 |

5. Click **"Deploy"** — takes about 1 minute

6. Your URL will be something like `resonance-dnd.vercel.app`
   - **Bookmark this on both your phones**
   - Michelle doesn't need any account — just the URL

---

## How to Play

### Starting a session

1. Open the URL on your phone
2. The GM will narrate the opening scene automatically
3. Select your character (MATT or MICHELLE button at the bottom)
4. Tap the **🎤 microphone** and speak what you want to do, or type it

### Voice input

- Tap the mic once to start listening, tap again to stop (or it stops automatically)
- Your words appear in the text box — you can edit before sending
- Works on Chrome (Android) and Safari (iOS)

### Taking actions

Speak or type naturally:
- *"I scan the room for anyone watching us"*
- *"I grab Matt's arm and pull him toward the back exit"*
- *"I try to bluff the guard — tell him we're with the archive delivery"*

The GM will either narrate what happens, or ask you to roll dice (the dice animate automatically).

### Dice rolls

When the GM calls for a roll, the dice appear on screen and roll automatically.
- **10+** Full success
- **7–9** Success with a complication or cost
- **6 or less** Something goes wrong
- **2–3** Disaster

### Playing apart

Both of you open the same URL on your own phones. You take turns — you'll see each other's actions and the GM's responses. The app checks for updates every 8 seconds.

### Ending a session

Tap the **⚔** icon (top right) → **"End Session & Save"**
Write a one-sentence summary when prompted. This saves to the campaign history so future sessions remember what happened.

---

## Your Characters

**MATT** — Waiter at the Salt & Wick. Witty, overlooked, loyal. Something strange happens around him sometimes. He doesn't know why.
- Best stats: **Will +3** (mental toughness)
- Abilities: Easily Overlooked, Not On My Watch (protect Michelle once/session), Lucky Break

**MICHELLE** — Scholar at the Varek Archive. Expert fighter who avoids fighting. She can read people and places like a language — she knows what she is.
- Best stats: **Acuity +3** (perception, magic, investigation)
- Abilities: Read Resonance, Reluctant Blade, Weight of Knowing

---

## The World

The **Concord** rules everything through its priests. They hunt people with abilities — calling them "Discord." The truth is darker than that. You'll find it.

**Conclave Awareness** (top right ⚡): How much the Concord suspects you. Starts at 0. Reaches 5, they start searching. Reaches 8, Wardens are ordered to capture you. Avoid drawing attention.

---

## Troubleshooting

**Mic button not working?** Try Chrome on Android or Safari on iOS. Some browsers require HTTPS — Vercel provides this automatically.

**"GM encountered an error"?** Your Gemini API key may have expired. Go back to aistudio.google.com and create a new one, then update it in Vercel's environment variables.

**Want to start a completely fresh campaign?** In the browser console, run: `fetch('/api/state', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({action:'reset'})})`
