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
})();
