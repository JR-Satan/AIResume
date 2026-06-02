<template>
  <div class="narrow-screen">
    <div class="content">
      <a-result status="warning" title="暂不支持移动端访问" sub-title="抱歉，暂不支持移动端访问，请使用电脑访问以获得最佳体验">
        <template #icon>
          <laptop-outlined class="custom-icon" />
        </template>
      </a-result>
    </div>
  </div>
</template>

<script setup lang="ts">
import { LaptopOutlined } from '@ant-design/icons-vue';
</script>

<style scoped>
.narrow-screen {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: var(--bg-color);
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.content {
  width: 100%;
  max-width: 500px;
}

.custom-icon {
  font-size: 48px;
  color: var(--color-base);
}

</style>
