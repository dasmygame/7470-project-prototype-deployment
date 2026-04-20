(() => {
  const listEl = document.getElementById("list");
  const emptyStateEl = document.getElementById("emptyState");
  const glideHintEl = document.getElementById("glideHint");
  const resolveBtn = document.getElementById("resolveBtn"); // optional (not in current HTML)
  const resetBtn = document.getElementById("resetBtn");
  const lockClockEl = document.getElementById("lockClock");
  const lockDateEl = document.getElementById("lockDate");
  const unlockTrack = document.getElementById("unlockTrack");
  const unlockHandle = document.getElementById("unlockHandle");
  const unlockLabel = document.getElementById("unlockLabel");

  const initialHTML = listEl.innerHTML;

  const TRAIL_FADE_MS = 500;
  const TRAIL_MAX_POINTS = 80;
  const TRAIL_MIN_DIST = 1.6;

  let trailCanvas = null;
  let trailCtx = null;
  let trailDpr = 1;
  const trailPoints = [];
  let trailGestureActive = false;
  let trailRaf = 0;
  let lastTrailX = null;
  let lastTrailY = null;

  const bindTrailCanvas = () => {
    trailCanvas = document.getElementById("notifTrail");
    if (!trailCanvas) {
      trailCtx = null;
      return;
    }
    trailCtx = trailCanvas.getContext("2d", { alpha: true });
    resizeTrailCanvas();
  };

  const resizeTrailCanvas = () => {
    if (!trailCanvas || !listEl) return;
    trailDpr = Math.min(2, window.devicePixelRatio || 1);
    const w = listEl.clientWidth;
    const h = listEl.clientHeight;
    trailCanvas.width = Math.max(1, Math.floor(w * trailDpr));
    trailCanvas.height = Math.max(1, Math.floor(h * trailDpr));
    trailCanvas.style.width = `${w}px`;
    trailCanvas.style.height = `${h}px`;
    if (trailCtx) {
      trailCtx.setTransform(trailDpr, 0, 0, trailDpr, 0, 0);
      trailCtx.globalCompositeOperation = "lighter";
    }
    drawTrailFrame(false);
  };

  const flushTrailCanvas = () => {
    if (!trailCtx || !trailCanvas) return;
    trailCtx.save();
    trailCtx.setTransform(1, 0, 0, 1, 0, 0);
    trailCtx.clearRect(0, 0, trailCanvas.width, trailCanvas.height);
    trailCtx.restore();
    if (trailCtx) {
      trailCtx.setTransform(trailDpr, 0, 0, trailDpr, 0, 0);
      trailCtx.globalCompositeOperation = "lighter";
    }
  };

  const scheduleTrailFrame = () => {
    if (trailRaf) return;
    trailRaf = window.requestAnimationFrame(() => {
      trailRaf = 0;
      drawTrailFrame(false);
    });
  };

  const drawTrailFrame = (clearOnly) => {
    if (!trailCtx || !trailCanvas) return;
    const now = performance.now();
    while (trailPoints.length && now - trailPoints[0].t > TRAIL_FADE_MS) {
      trailPoints.shift();
    }
    flushTrailCanvas();
    if (clearOnly || trailPoints.length === 0) return;

    const shimmer = 0.88 + 0.12 * Math.sin(now * 0.014);

    for (let i = 0; i < trailPoints.length; i++) {
      const p = trailPoints[i];
      const age = now - p.t;
      const life = 1 - age / TRAIL_FADE_MS;
      if (life <= 0) continue;
      const a0 = life * life;
      const r = 4 + 9 * a0;
      const baseA = (0.16 + 0.58 * a0) * shimmer;
      const g = trailCtx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
      g.addColorStop(0, `rgba(230, 248, 255, ${Math.min(1, baseA * 1.05)})`);
      g.addColorStop(0.42, `rgba(130, 200, 255, ${baseA * 0.42})`);
      g.addColorStop(1, "rgba(70, 130, 255, 0)");
      trailCtx.fillStyle = g;
      trailCtx.beginPath();
      trailCtx.arc(p.x, p.y, r, 0, Math.PI * 2);
      trailCtx.fill();
    }

    if (trailPoints.length) scheduleTrailFrame();
  };

  const pushTrailPoint = (clientX, clientY) => {
    if (!trailCanvas || !listEl) return;
    const r = listEl.getBoundingClientRect();
    const x = clientX - r.left;
    const y = clientY - r.top;
    if (x < -24 || y < -24 || x > r.width + 24 || y > r.height + 24) return;

    if (lastTrailX != null && lastTrailY != null) {
      const dx = x - lastTrailX;
      const dy = y - lastTrailY;
      if (dx * dx + dy * dy < TRAIL_MIN_DIST * TRAIL_MIN_DIST) return;
    }
    lastTrailX = x;
    lastTrailY = y;
    trailPoints.push({ x, y, t: performance.now() });
    while (trailPoints.length > TRAIL_MAX_POINTS) trailPoints.shift();
    scheduleTrailFrame();
  };

  const resetTrailGesture = () => {
    trailGestureActive = false;
    lastTrailX = null;
    lastTrailY = null;
  };

  const maybeStartTrailFromTarget = (target) => {
    if (!target || !target.closest) return;
    if (target.closest(".actionBtn") || target.closest(".actions")) {
      trailGestureActive = true;
    }
  };

  // notifId -> resolved (true means card is already cleared)
  const cardResolved = new Map();

  const DWELL_MS = 100;

  let dwellBtn = null;
  let dwellStart = 0;
  let dwellRafId = 0;

  let gliding = false;
  let pointerId = null;

  const leaveDwell = () => {
    if (dwellRafId) {
      window.cancelAnimationFrame(dwellRafId);
      dwellRafId = 0;
    }
    if (dwellBtn) {
      dwellBtn.classList.remove("dwell", "active");
      dwellBtn.style.removeProperty("--dwell");
    }
    dwellBtn = null;
    dwellStart = 0;
  };

  const dwellLoop = () => {
    dwellRafId = 0;
    if (!dwellBtn || !dwellBtn.isConnected) {
      leaveDwell();
      return;
    }
    const notifId = dwellBtn.dataset.notif;
    if (cardResolved.get(notifId)) {
      leaveDwell();
      return;
    }
    const elapsed = performance.now() - dwellStart;
    const p = Math.min(1, elapsed / DWELL_MS);
    dwellBtn.style.setProperty("--dwell", String(p));
    dwellBtn.classList.add("active", "dwell");
    if (p >= 1) {
      const action = dwellBtn.dataset.action;
      leaveDwell();
      resolveNotification(notifId, action);
      return;
    }
    dwellRafId = window.requestAnimationFrame(dwellLoop);
  };

  const enterOrContinueDwell = (btn) => {
    if (!btn || !listEl.contains(btn)) {
      leaveDwell();
      return;
    }
    const id = btn.dataset.notif;
    if (cardResolved.get(id)) {
      leaveDwell();
      return;
    }
    if (dwellBtn === btn) {
      if (!dwellRafId) dwellRafId = window.requestAnimationFrame(dwellLoop);
      return;
    }
    if (dwellBtn) {
      dwellBtn.classList.remove("dwell", "active");
      dwellBtn.style.removeProperty("--dwell");
    }
    if (dwellRafId) {
      window.cancelAnimationFrame(dwellRafId);
      dwellRafId = 0;
    }
    dwellBtn = btn;
    dwellStart = performance.now();
    dwellRafId = window.requestAnimationFrame(dwellLoop);
  };

  const syncDwellFromClient = (clientX, clientY) => {
    if (!emptyStateEl.classList.contains("hidden")) {
      leaveDwell();
      return;
    }
    const under = document.elementFromPoint(clientX, clientY);
    const btn = findClosestActionBtn(under);
    if (!btn) {
      leaveDwell();
      return;
    }
    enterOrContinueDwell(btn);
  };

  const updateEmptyState = () => {
    const remaining = listEl.querySelectorAll(".card").length;
    const isEmpty = remaining === 0;
    emptyStateEl.classList.toggle("hidden", !isEmpty);
    emptyStateEl.setAttribute("aria-hidden", String(!isEmpty));
  };

  const resolveNotification = (notifId, action) => {
    if (cardResolved.get(notifId)) return;

    const cardEl = listEl.querySelector(`.card[data-id="${notifId}"]`);
    if (!cardEl) return;

    cardResolved.set(notifId, true);
    cardEl.dataset.resolvedAction = action;
    cardEl.classList.add("resolved");
    cardEl.style.pointerEvents = "none";

    // After the fade/slide, remove the card.
    window.setTimeout(() => {
      if (cardEl.isConnected) cardEl.remove();
      updateEmptyState();
    }, 240);
  };

  const clearAll = () => {
    const cards = Array.from(listEl.querySelectorAll(".card"));
    for (const cardEl of cards) {
      const notifId = cardEl.dataset.id;
      // Demo defaults:
      // - email/text: delete
      // - reminder/alarm: reset
      let action = "delete";
      if (notifId === "alarm" || notifId === "reminder") action = "reset";
      resolveNotification(notifId, action);
    }
  };

  const pad2 = (n) => String(n).padStart(2, "0");

  const updateLockClock = () => {
    if (!lockClockEl || !lockDateEl) return;
    const now = new Date();
    const h12 = now.getHours() % 12 || 12;
    const ampm = now.getHours() >= 12 ? "PM" : "AM";
    lockClockEl.textContent = `${h12}:${pad2(now.getMinutes())} ${ampm}`;
    const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const months = [
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December",
    ];
    lockDateEl.textContent = `${days[now.getDay()]}, ${months[now.getMonth()]} ${now.getDate()}`;
  };

  let unlockDragging = false;
  let unlockPointerId = null;
  let unlockStartX = 0;
  let unlockOffset = 0;
  let unlockMax = 0;
  let unlockResetTimer = null;

  const getUnlockMax = () => {
    if (!unlockTrack || !unlockHandle) return 0;
    const tw = unlockTrack.getBoundingClientRect().width;
    const hw = unlockHandle.getBoundingClientRect().width;
    const pad = 12;
    return Math.max(0, tw - hw - pad);
  };

  const setUnlockProgress = (px) => {
    if (!unlockHandle || !unlockTrack || !unlockLabel) return;
    unlockOffset = Math.max(0, Math.min(unlockMax, px));
    unlockHandle.style.transform = `translateX(${unlockOffset}px)`;
    const pct = unlockMax > 0 ? Math.round((unlockOffset / unlockMax) * 100) : 0;
    unlockTrack.setAttribute("aria-valuenow", String(pct));
  };

  const resetUnlockUI = () => {
    if (unlockResetTimer) {
      window.clearTimeout(unlockResetTimer);
      unlockResetTimer = null;
    }
    unlockDragging = false;
    unlockPointerId = null;
    unlockMax = getUnlockMax();
    unlockOffset = 0;
    unlockTrack?.classList.remove("dragging", "unlocked");
    setUnlockProgress(0);
    if (unlockLabel) unlockLabel.textContent = "Swipe to unlock";
  };

  const completeUnlock = () => {
    if (!unlockTrack || !unlockLabel) return;
    unlockTrack.classList.add("unlocked");
    unlockLabel.textContent = "Unlocked";
    unlockTrack.setAttribute("aria-valuenow", "100");
    unlockResetTimer = window.setTimeout(() => {
      resetUnlockUI();
    }, 900);
  };

  const onUnlockPointerDown = (e) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (unlockResetTimer) return;
    unlockDragging = true;
    unlockPointerId = e.pointerId;
    unlockStartX = e.clientX - unlockOffset;
    unlockMax = getUnlockMax();
    unlockTrack.classList.add("dragging");
    try {
      unlockTrack.setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    e.preventDefault();
  };

  const onUnlockPointerMove = (e) => {
    if (!unlockDragging || e.pointerId !== unlockPointerId) return;
    unlockMax = getUnlockMax();
    const next = e.clientX - unlockStartX;
    setUnlockProgress(next);
    if (unlockMax > 0 && unlockOffset >= unlockMax * 0.92) {
      unlockDragging = false;
      try {
        unlockTrack.releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
      unlockTrack.classList.remove("dragging");
      setUnlockProgress(unlockMax);
      completeUnlock();
    }
    e.preventDefault();
  };

  const onUnlockPointerUp = (e) => {
    if (!unlockDragging || e.pointerId !== unlockPointerId) return;
    unlockDragging = false;
    try {
      unlockTrack.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    unlockTrack.classList.remove("dragging");
    if (unlockMax > 0 && unlockOffset >= unlockMax * 0.92) {
      setUnlockProgress(unlockMax);
      completeUnlock();
    } else {
      resetUnlockUI();
    }
    e.preventDefault();
  };

  const resetDemo = () => {
    leaveDwell();
    listEl.innerHTML = initialHTML;
    cardResolved.clear();
    gliding = false;
    pointerId = null;

    if (glideHintEl) glideHintEl.classList.remove("active");
    emptyStateEl.classList.add("hidden");
    emptyStateEl.setAttribute("aria-hidden", "true");
    resetUnlockUI();
    updateLockClock();
    trailPoints.length = 0;
    resetTrailGesture();
    bindTrailCanvas();
    drawTrailFrame(true);
  };

  const findClosestActionBtn = (target) => {
    const btn = target && target.closest ? target.closest(".actionBtn") : null;
    if (!btn) return null;
    return listEl.contains(btn) ? btn : null;
  };

  const onPointerDown = (e) => {
    // Only left mouse button / touch / pen.
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (!emptyStateEl.classList.contains("hidden")) return;

    gliding = true;
    pointerId = e.pointerId;
    lastActionKey = null;

    maybeStartTrailFromTarget(e.target);
    if (trailGestureActive) {
      pushTrailPoint(e.clientX, e.clientY);
    }

    if (glideHintEl) {
      glideHintEl.classList.add("active");
      glideHintEl.textContent = "Hold on a button for 1 second to resolve";
    }

    syncDwellFromClient(e.clientX, e.clientY);

    try {
      listEl.setPointerCapture(pointerId);
    } catch {
      // Ignore pointer capture failures.
    }

    e.preventDefault();
  };

  const onPointerMove = (e) => {
    if (!gliding) return;

    const underPointer = document.elementFromPoint(e.clientX, e.clientY);
    const btn = findClosestActionBtn(underPointer);
    if (btn) {
      trailGestureActive = true;
    }
    if (trailGestureActive) {
      pushTrailPoint(e.clientX, e.clientY);
    }
    syncDwellFromClient(e.clientX, e.clientY);

    e.preventDefault();
  };

  const endGlide = () => {
    gliding = false;
    pointerId = null;
    if (glideHintEl) glideHintEl.classList.remove("active");
    resetTrailGesture();
    leaveDwell();
  };

  const onListMouseMove = (e) => {
    if (gliding) return;
    syncDwellFromClient(e.clientX, e.clientY);
  };

  const onListMouseLeave = () => {
    if (gliding) return;
    leaveDwell();
  };

  const onClick = (e) => {
    const btn = findClosestActionBtn(e.target);
    if (!btn) return;
    trailGestureActive = true;
    pushTrailPoint(e.clientX, e.clientY);
    pushTrailPoint(e.clientX + 0.8, e.clientY + 0.6);
  };

  // Init state
  cardResolved.clear();
  updateEmptyState();
  if (glideHintEl) glideHintEl.classList.remove("active");
  updateLockClock();
  window.setInterval(updateLockClock, 30000);
  resetUnlockUI();
  window.requestAnimationFrame(() => {
    resetUnlockUI();
    updateLockClock();
  });
  window.addEventListener("resize", () => {
    if (!unlockDragging) resetUnlockUI();
    resizeTrailCanvas();
  });

  bindTrailCanvas();

  if (unlockTrack && unlockHandle) {
    unlockTrack.addEventListener("pointerdown", onUnlockPointerDown, { passive: false });
    unlockTrack.addEventListener("pointermove", onUnlockPointerMove, { passive: false });
    unlockTrack.addEventListener("pointerup", onUnlockPointerUp, { passive: false });
    unlockTrack.addEventListener("pointercancel", onUnlockPointerUp, { passive: false });
  }

  listEl.addEventListener("pointerdown", onPointerDown, { passive: false });
  listEl.addEventListener("pointermove", onPointerMove, { passive: false });
  listEl.addEventListener("pointerup", endGlide, { passive: true });
  listEl.addEventListener("pointercancel", endGlide, { passive: true });
  listEl.addEventListener("pointerleave", endGlide, { passive: true });
  listEl.addEventListener("mousemove", onListMouseMove, { passive: true });
  listEl.addEventListener("mouseleave", onListMouseLeave, { passive: true });

  // Trail sparkle on click (resolve still requires 1s dwell).
  listEl.addEventListener("click", onClick);

  // Optional "Clear all" button if user adds it.
  if (resolveBtn) resolveBtn.addEventListener("click", clearAll);
  resetBtn.addEventListener("click", resetDemo);
})();

