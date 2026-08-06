(() => {
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
})();
