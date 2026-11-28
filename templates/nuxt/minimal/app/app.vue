<script setup lang="ts">
// The site title from Settings in the admin.
const { data: general } = await useTenon().getGlobal("general");
</script>

<template>
  <header class="wrap header">
    <NuxtLink class="brand" to="/">{{ general?.title || "Home" }}</NuxtLink>
    <div class="header-end">
      <a href="/admin">Admin ↗</a>
      <ThemeSwitch />
    </div>
  </header>
  <NuxtPage />
  <footer class="wrap">
    <div class="footer">
      <span>Built with tenoncms</span>
      <nav aria-label="Tenon">
        <a href="https://tenoncms.com/docs">Docs</a>
        <a href="https://github.com/SuddenDev/TenonCMS">GitHub</a>
      </nav>
    </div>
  </footer>
</template>
