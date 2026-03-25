<script setup>
import { RouterView } from 'vue-router'
</script>

<template>
  <RouterView />
</template>

<style>
/* Reset and base styles */
:root {
  --primary-color: #246FE5;
  --bg-color: #F1F4F6;
  --text-color: #2E3742;
}

body {
  margin: 0;
  padding: 0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
  background-color: var(--bg-color);
  color: var(--text-color);
  -webkit-font-smoothing: antialiased;
}

#app {
  width: 100%;
  height: 100vh;
  display: flex;
  flex-direction: column;
}
</style>
