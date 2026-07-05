// Everyone subscribed to this world except the sender's own devices — you
// don't need a notification for the turn you just took yourself.
function selectNotifyTargets(subscriptions, senderPlayer) {
  return (subscriptions || []).filter((s) => s.player !== senderPlayer);
}

// Deliberately generic — never narration content. Keeps this simple (no need
// to special-case the adult gate for what shows up in a system notification
// tray) and avoids spoiling the story in a lock-screen preview either way.
function buildNotificationPayload(worldDisplayName, playerDisplayName) {
  return {
    title: worldDisplayName,
    body: `${playerDisplayName} took a turn — tap to see what happens!`,
  };
}

// api/cron-turn-reminder.js's nudge for a world that's gone idle — same
// generic, narration-free stance as buildNotificationPayload above.
function buildStallReminderPayload(worldDisplayName) {
  return {
    title: worldDisplayName,
    body: `It's been a couple of days — your turn is waiting!`,
  };
}

// The Living World's ambient "meanwhile..." beat — same generic, narration-
// free stance as the other payloads (the actual beat text never appears in
// a lock-screen preview, only in-app).
function buildAmbientPayload(worldDisplayName) {
  return {
    title: worldDisplayName,
    body: `The world moved on while you were away — tap to see what happened.`,
  };
}

module.exports = { selectNotifyTargets, buildNotificationPayload, buildStallReminderPayload, buildAmbientPayload };
