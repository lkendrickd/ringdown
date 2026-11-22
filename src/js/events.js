/* ================= event log and hooks =================
   What the timeline, the graphs and the challenges share, so none of them has to reach into the frame loop.

   events      every notice the simulation raises (a merger, a nova, a disruption...) is logged here by toast(), with
               the simulation time it happened at. logEvent() can also be called directly for something that has no
               notice. The newest 500 are kept.
   eventHooks  called with each event as it is logged.
   frameHooks  called once a frame, after the simulation has advanced and before the frame is drawn, with the
               simulation time and the wall time (seconds) that frame covered. Also runs while paused (simDt = 0)
               and under the test hook's step(), so anything driven from here is deterministic in the tests.
   sceneHooks  called whenever the whole scene is replaced: a preset is loaded, or a shared or saved scene restored.
               The event log has just been emptied.
   rewindHooks called with the new simulation time after the scene has been put back to an earlier moment (rewound()).
               Events later than that moment have just been dropped. Anything that keeps a history trims it here. */
const events = [], eventHooks = [], frameHooks = [], sceneHooks = [], rewindHooks = [];
let eventN = 0;
function logEvent(title, kind, data) {
  const ev = { n: ++eventN, t: simTime, title, kind: kind || '', data };
  events.push(ev); if (events.length > 500) events.shift();
  for (const f of eventHooks) f(ev);
  return ev;
}
function sceneChanged() { events.length = 0; for (const f of sceneHooks) f(); }
function rewound(t) { while (events.length && events[events.length - 1].t > t) events.pop(); for (const f of rewindHooks) f(t); }
