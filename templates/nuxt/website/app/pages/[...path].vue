<script setup lang="ts">
import { menuItems } from "tenoncms/client";
import { edit } from "tenoncms/preview";
import Hero from "~/blocks/Hero.vue";
import Image from "~/blocks/Image.vue";
import List from "~/blocks/List.vue";
import Text from "~/blocks/Text.vue";

// Every URL lands here and shows the page with that path. `/` is the page with the slug `index`.
const route = useRoute();
const tenon = useTenon();
const [{ data: page, status, error }, { data: general }, { data: menu }] = await Promise.all([
  tenon.findOne("pages", () => ({ where: { path: route.path } })),
  tenon.getGlobal("general"),
  tenon.getGlobal("mainMenu"),
]);
watchEffect(() => {
  if (error.value) showError(error.value);
  else if (status.value === "success" && !page.value)
    showError({ statusCode: 404, statusMessage: "Page not found", fatal: true });
});
await useTenonSeo(page);

const links = computed(() => menuItems(menu.value?.items));
const blocks = { hero: Hero, image: Image, text: Text, list: List };
</script>

<template>
  <header class="wrap header">
    <NuxtLink class="brand" to="/" :data-cms="edit('general', null, 'title')">
      {{ general?.title || "Home" }}
    </NuxtLink>
    <div class="header-end">
      <nav aria-label="Main">
        <ul class="nav">
          <li v-for="(item, i) in links" :key="i">
            <NuxtLink :to="item.href ?? undefined" :target="item.target">{{ item.label }}</NuxtLink>
          </li>
        </ul>
      </nav>
      <ThemeSwitch />
    </div>
  </header>
  <TenonBlocks
    v-if="page"
    as="main"
    :blocks="page.content"
    :components="blocks"
    :edit="{ collection: 'pages', id: page.id, path: 'content' }"
  />
  <footer class="footer">
    <div class="wrap">
      <span>© {{ new Date().getFullYear() }} {{ general?.title }}</span>
      <span>Built with <a href="https://github.com/SuddenDev/TenonCMS">tenoncms</a></span>
    </div>
  </footer>
</template>
