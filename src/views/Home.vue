<script setup lang="ts">
import { useRouter } from "vue-router";

const router = useRouter();

const goToAbout = () => {
  router.push("/chat"); // 跳转到 /about
};
</script>
<template>
  <button @click="goToAbout">测试</button>
</template>
