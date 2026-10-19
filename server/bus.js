// Live updates over Server-Sent Events. One process only: if you run several server
// instances, move this to Redis or Postgres LISTEN/NOTIFY.

export function createBus() {
  const clients = new Set();
  const online = () => new Set([...clients].map((c) => c.userId)).size;
  const send = (c, event, data) => { try { c.res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); } catch { /* socket closed */ } };
  const broadcast = (event, data) => { for (const c of clients) send(c, event, data); };

  const heartbeat = setInterval(() => { for (const c of clients) { try { c.res.write(': ping\n\n'); } catch { /* closed */ } } }, 25000);
  heartbeat.unref?.();

  return {
    online,
    broadcast,
    changed(...kinds) { broadcast('change', { kinds }); },
    add(userId, res) {
      const mine = [...clients].filter((c) => c.userId === userId);
      while (mine.length >= 5) { const old = mine.shift(); old.res.end(); clients.delete(old); }
      const c = { userId, res };
      clients.add(c);
      res.write('retry: 5000\n\n');
      send(c, 'online', { count: online() });
      broadcast('online', { count: online() });
      return () => { clients.delete(c); broadcast('online', { count: online() }); };
    },
    disconnectUser(userId) {
      for (const c of [...clients]) if (c.userId === userId) { try { c.res.end(); } catch { /* closed */ } clients.delete(c); }
    },
    stop() { clearInterval(heartbeat); for (const c of clients) { try { c.res.end(); } catch { /* closed */ } } clients.clear(); },
  };
}
