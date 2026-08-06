(() => {
  document.documentElement.classList.remove("no-js");
  document.documentElement.classList.add("js");

  const yearEls = document.querySelectorAll("[data-year]");
  const year = String(new Date().getFullYear());
  yearEls.forEach((el) => {
    el.textContent = year;
  });

  const toggle = document.querySelector("[data-nav-toggle]");
  const links = document.querySelector("[data-nav-links]");
  if (toggle && links) {
    const setOpen = (open) => {
      links.classList.toggle("open", open);
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    };

    toggle.setAttribute("aria-expanded", "false");
    toggle.setAttribute("aria-controls", "site-nav");
    if (!links.id) links.id = "site-nav";

    toggle.addEventListener("click", () => {
      setOpen(!links.classList.contains("open"));
    });

    links.querySelectorAll("a").forEach((a) => {
      a.addEventListener("click", () => setOpen(false));
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") setOpen(false);
    });

    document.addEventListener("click", (e) => {
      if (!links.classList.contains("open")) return;
      if (links.contains(e.target) || toggle.contains(e.target)) return;
      setOpen(false);
    });
  }

  // Soft highlight current page in nav. Pages are served extensionless
  // (/pricing) in production, so compare with .html stripped.
  const norm = (s) => s.replace(/\.html$/, "") || "index";
  const path = norm((location.pathname.split("/").pop() || "index.html").toLowerCase());
  document.querySelectorAll(".nav-links a[href]").forEach((a) => {
    const href = (a.getAttribute("href") || "").toLowerCase();
    if (norm(href) === path) {
      a.setAttribute("aria-current", "page");
    }
  });

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const nav = document.querySelector(".nav");
  const pageBg = document.querySelector(".page-bg");

  const onScroll = () => {
    const y = window.scrollY || document.documentElement.scrollTop;
    if (nav) nav.classList.toggle("is-scrolled", y > 12);
    if (pageBg && !reduceMotion) {
      // Subtle glow drift — feels fluid without fighting scroll
      const shift = Math.min(y * 0.04, 48);
      pageBg.style.transform = `translate3d(0, ${shift}px, 0)`;
    }
  };

  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });

  if (reduceMotion || !("IntersectionObserver" in window)) {
    document.querySelectorAll("[data-reveal], [data-reveal-stagger]").forEach((el) => {
      el.classList.add("is-visible");
    });
    return;
  }

  const revealObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        revealObserver.unobserve(entry.target);
      });
    },
    {
      root: null,
      rootMargin: "0px 0px -8% 0px",
      threshold: 0.12,
    }
  );

  document.querySelectorAll("[data-reveal], [data-reveal-stagger]").forEach((el) => {
    revealObserver.observe(el);
  });

  // Failsafe: never leave content permanently hidden
  window.setTimeout(() => {
    document.querySelectorAll("[data-reveal]:not(.is-visible), [data-reveal-stagger]:not(.is-visible)").forEach((el) => {
      el.classList.add("is-visible");
    });
  }, 4000);
})();
