(() => {
  const yearEls = document.querySelectorAll("[data-year]");
  const year = String(new Date().getFullYear());
  yearEls.forEach((el) => {
    el.textContent = year;
  });

  const toggle = document.querySelector("[data-nav-toggle]");
  const links = document.querySelector("[data-nav-links]");
  if (toggle && links) {
    toggle.addEventListener("click", () => {
      links.classList.toggle("open");
    });
    links.querySelectorAll("a").forEach((a) => {
      a.addEventListener("click", () => links.classList.remove("open"));
    });
  }

  // Soft-highlight the download card matching the visitor's OS
  const ua = navigator.userAgent || "";
  const isMac = /Mac|iPhone|iPad|iPod/i.test(ua);
  const isWin = /Windows/i.test(ua);
  document.querySelectorAll(".download-card").forEach((card) => {
    const title = (card.querySelector("h3")?.textContent || "").toLowerCase();
    if ((isMac && title.includes("mac")) || (isWin && title.includes("windows"))) {
      card.classList.add("recommended");
    }
  });
})();
