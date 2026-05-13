<script setup>
import { RouterView } from 'vue-router'
</script>

<template>
    <div class="app-container">
        <RouterView />
    </div>
</template>

<style>
.app-container {
    min-height: 100vh;
    display: flex;
    justify-content: center;
    align-items: flex-start;
    padding-top: 40px;
}
</style>
