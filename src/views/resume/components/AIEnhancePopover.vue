<script setup lang="ts">
defineProps<{
  description?: string;
  extend?: string;
}>();

defineEmits<{
  update: [content: string];
}>();
</script>

<template>
  <slot />
</template>
