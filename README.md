# Resonance: A Legacy Campaign

A two-player narrative RPG for Matt & Michelle. Open on your phones, speak your actions, the GM responds.

**Play at:** https://resonance-dnd.vercel.app

---

## How to Play

### Starting a session

1. Open **https://resonance-dnd.vercel.app** on your phone — bookmark it
2. The GM narrates the opening scene automatically on first load
3. On the **Story** tab, select your character using the **FEN** or **LYRA** button at the bottom
4. Tap the **🎤 microphone** and speak what you want to do, or type it

### The four tabs

| Tab | What it's for |
|-----|--------------|
| **◈ Story** | The main narration log and your action input |
| **⚔ Characters** | Character cards, abilities, harm — and End Session |
| **≡ Archive** | Full logs from completed sessions — tap **⬇ Export** to download the campaign as a text file |
| **⊕ Map** | City map of Varek, Conclave Awareness meter |

### Voice input

- Tap the mic once to start, tap again to stop (or it stops automatically after a pause)
- Your words appear in the text box — you can edit before sending
- Works best on **Chrome (Android)** and **Safari (iOS)**

### Text-to-speech

Every GM narration has a small **🔊** button in the top right corner of the text block.
- Tap it to hear the story read aloud in a storytelling voice
- While reading, it turns into **⏹** — tap again to stop
- Tapping a new entry stops the current one and starts the new one
- **Auto-read** — tap the 🔊 button in the top-right header to automatically read every new GM narration as it arrives

### Taking actions

Speak or type naturally — describe what your character does:
- *"I scan the room for anyone watching us"*
- *"I grab Fen's arm and pull him toward the back exit"*
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

### Using abilities

Go to the **⚔ Characters** tab to manage abilities:
- Tap an ability to mark it **Used** for the session (it strikes through and grays out)
- Lyra's **◈ Magic** counter: tap to spend one Resonance charge
- Abilities reset automatically when you start a new session

### Recovering from harm

When a character is injured, their harm badge in the **⚔ Characters** tab glows and becomes tappable.
- Tap the harm badge (e.g., **Hurt**) to recover one step (Hurt → Scratched)
- Use this when a rest or recovery scene has happened in the narrative

### Playing apart — unread indicator

When you're on another tab (Map, Archive, Characters) and your partner takes an action, a small red dot appears on the **◈ Story** tab button. Tap Story to read the new narration and clear the indicator.

### Playing together or apart

Both of you open the same URL on your own phones. You take turns — each player's actions and the GM's responses are visible to both. The app syncs every 8 seconds, so there's a brief delay when playing from separate locations.

### Ending a session

Go to the **⚔ Characters** tab → **"End Session & Save"**

Write a one-sentence summary when prompted. This archives the full session log permanently — viewable later in the **≡ Archive** tab.

---

## Your Characters

**FEN** — Waiter at the Salt & Wick pub. Witty, sarcastic, loyal to a fault. People have always overlooked him — he assumed it was just bad luck. It isn't.
- Strongest stat: **Will +3**
- Abilities: *Easily Overlooked* (advantage on stealth/eavesdropping), *Not On My Watch* (take a hit meant for Lyra once per session), *Lucky Break* (once per session, something inexplicably goes right when everything is going wrong)

**LYRA** — Scholar at the Varek Archive. Formidably trained in combat, though she avoids it. She can read people and places like a language — sense truth and lies, feel the bonds between people, understand the hidden structure of things. She knows exactly what she is. She's been keeping it secret for three years.
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

The **⊕ Map** tab shows Varek — your current location pulses gold. The map updates automatically as you move between locations during play. Red markers are Conclave territory. Tap any location for a description.

Locations you haven't visited yet appear dimmed. As you explore, they light up permanently.

Some locations will eventually show a small crimson **✕** mark — a **location scar**, placed by the GM when something permanent and significant happened there. Tap the location to see what left its mark.

---

## The Magic System — Resonance

Everything in the world vibrates at a natural frequency. Most people feel nothing. A rare few — called Resonants — can perceive and manipulate these frequencies. The Concord calls them Discord. They call themselves nothing, because naming yourself is how you get caught.

**Harmonic** (Lyra): You *read* frequencies. Truth vs. lies. The emotional threads between people. The hidden structure of objects and places. The world has no secrets from you, if you know how to listen.

**Dissonant** (Fen): You *disrupt* frequencies. Things slip past you. Alarms don't notice you. People's eyes slide off you. You've always been forgettable — turns out there's a reason.

*(Fen does not know he is a Dissonant. This will emerge during play.)*

---

## Troubleshooting

**Mic button not working?**
Use Chrome on Android or Safari on iOS. Other browsers may not support voice input — type instead.

**🔊 Speaker button not working?**
Some browsers require a user interaction before allowing audio. Tap something else on the page first, then tap the speaker button.

**GM not responding / error message?**
The Groq API key may have expired or hit a limit. Go to console.groq.com, create a new key, update `GROQ_API_KEY` in Vercel under Settings → Environment Variables, then redeploy.

**App seems stuck / not loading new messages?**
Pull down to refresh. The session log reloads from the server.

**Prompted for a secret on first load?**
The app requires a campaign secret to prevent strangers from resetting your progress. Enter the value of `GAME_SECRET` from your Vercel environment variables. It's stored in your browser after the first entry — you won't be prompted again on that device. To share with Michelle, visit `https://resonance-dnd.vercel.app?secret=YOUR_SECRET_HERE` once on her phone and it will be saved automatically.

**Start a completely fresh campaign:**
Go to the **⚔ Characters** tab → "End Session & Save" to archive the session first. For a full wipe, open the browser console and run (replacing YOUR_SECRET with your `GAME_SECRET` value):
`fetch('/api/state',{method:'POST',headers:{'Content-Type':'application/json','X-Game-Secret':'YOUR_SECRET'},body:JSON.stringify({action:'reset'})})`

---

## Technical Notes

- **Hosting:** Vercel (free) — auto-deploys when GitHub repo is updated
- **Database:** Upstash Redis (free) — stores campaign state between sessions
- **AI GM:** Groq API — Llama 3.3 70B model (free tier, no credit card required)
- **Voice input:** Web Speech API (built into Chrome/Safari)
- **Text-to-speech:** Web Speech Synthesis API (built into Chrome/Safari, no key needed)
- **GitHub repo:** https://github.com/mattmanne/resonance-dnd
- **Vercel dashboard:** https://vercel.com (log in with Google)
- **Upstash dashboard:** https://upstash.com (log in with Google)
- **Groq dashboard:** https://console.groq.com (log in with Google)
