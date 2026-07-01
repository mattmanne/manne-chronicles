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

module.exports = { selectNotifyTargets, buildNotificationPayload };
