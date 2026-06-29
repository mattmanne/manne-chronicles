# Resonance: A Legacy Campaign

A two-player narrative RPG for Matt & Michelle. Open on your phones, speak your actions, the GM responds.

**Play at:** https://resonance-dnd.vercel.app

---

## How to Play

### Starting a session

1. Open **https://resonance-dnd.vercel.app** on your phone — bookmark it
2. The GM narrates the opening scene automatically on first load
3. Select your character using the **MATT** or **MICHELLE** button at the bottom
4. Tap the **🎤 microphone** and speak what you want to do, or type it

### Voice input

- Tap the mic once to start, tap again to stop (or it stops automatically after a pause)
- Your words appear in the text box — you can edit before sending
- Works best on **Chrome (Android)** and **Safari (iOS)**

### Taking actions

Speak or type naturally — describe what your character does:
- *"I scan the room for anyone watching us"*
- *"I grab Matt's arm and pull him toward the back exit"*
- *"I try to bluff the guard — tell him we're with the archive delivery"*

The GM narrates what happens, or calls for a dice roll (dice animate automatically on screen).

### Dice rolls

When the GM calls for a roll, the dice appear and roll automatically.

| Result | Outcome |
|--------|---------|
| 10+ | Full success |
| 7–9 | Success with a complication or cost |
| 6 or less | Something goes wrong |
| 2–3 | Disaster |

### Playing together or apart

Both of you open the same URL on your own phones. You take turns — each player's actions and the GM's responses are visible to both. The app syncs every 8 seconds, so there's a brief delay when playing from separate locations.

### Ending a session

Tap the **⚔** icon (top right) → **"End Session & Save"**

Write a one-sentence summary when prompted. This saves permanently to campaign history so future sessions remember what happened.

---

## Your Characters

**MATT** — Waiter at the Salt & Wick pub. Witty, sarcastic, loyal to a fault. People have always overlooked him — he assumed it was just bad luck. It isn't.
- Strongest stat: **Will +3**
- Abilities: *Easily Overlooked* (advantage on stealth/eavesdropping), *Not On My Watch* (take a hit meant for Michelle once per session), *Lucky Break* (once per session, something inexplicably goes right when everything is going wrong)

**MICHELLE** — Scholar at the Varek Archive. Formidably trained in combat, though she avoids it. She can read people and places like a language — sense truth and lies, feel the bonds between people, understand the hidden structure of things. She knows exactly what she is. She's been keeping it secret for three years.
- Strongest stat: **Acuity +3**
- Abilities: *Read Resonance* (sense truth/lies, emotional bonds, structural weaknesses), *Reluctant Blade* (end fights non-lethally at no penalty), *Weight of Knowing* (once per session, spend a harm condition for a critical insight)

---

## The World

The **Concord** rules everything. Its priests teach that magic is corruption — called "Discord" — and hunt those who carry it. The Conclave's enforcers, the **Accord Wardens**, patrol every city in grey cloaks. They carry tuning forks that hum near people like you.

The truth is darker. You'll find it.

**⚡ Conclave Awareness** (top right): How much the Concord suspects you exist. Starts at 0.
- Reaches 5: they begin actively searching
- Reaches 8: Wardens are ordered to capture you on sight

Keep it low. Don't draw attention.

---

## The Magic System — Resonance

Everything in the world vibrates at a natural frequency. Most people feel nothing. A rare few — called Resonants — can perceive and manipulate these frequencies. The Concord calls them Discord. They call themselves nothing, because naming yourself is how you get caught.

**Harmonic** (Michelle): You *read* frequencies. Truth vs. lies. The emotional threads between people. The hidden structure of objects and places. The world has no secrets from you, if you know how to listen.

**Dissonant** (Matt): You *disrupt* frequencies. Things slip past you. Alarms don't notice you. People's eyes slide off you. You've always been forgettable — turns out there's a reason.

*(Matt does not know he is a Dissonant. This will emerge during play.)*

---

## Troubleshooting

**Mic button not working?**
Use Chrome on Android or Safari on iOS. Other browsers may not support voice input — type instead.

**GM not responding / error message?**
The Gemini API key may have expired (they occasionally do). Matt: go to aistudio.google.com, create a new key, update `GEMINI_API_KEY` in Vercel environment variables, then redeploy.

**App seems stuck / not loading new messages?**
Pull down to refresh the page. The session log reloads from the server.

**Start a completely fresh campaign:**
In your phone's browser, open the URL and add `/api/state` at the end. You won't see anything useful — this is just for reference. To fully reset, Matt can open the browser developer console and run:
`fetch('/api/state',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'reset'})})`

---

## Technical Notes (Matt only)

- **Hosting:** Vercel (free) — auto-deploys when GitHub repo is updated
- **Database:** Upstash Redis (free) — stores campaign state between sessions
- **AI GM:** Google Gemini 1.5 Flash (free tier) — no credit card required
- **GitHub repo:** https://github.com/mattmanne/resonance-dnd
- **Vercel dashboard:** https://vercel.com (log in with Google)
- **Upstash dashboard:** https://upstash.com (log in with Google)
