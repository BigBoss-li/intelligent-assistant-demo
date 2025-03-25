import { createRouter, createWebHashHistory } from 'vue-router';
import Chat from '../views/Chat.vue';
import Home from '../views/Home.vue';

const routes = [
    { path: '/', component: Home },
    { path: '/chat', component: Chat }
];

const router = createRouter({
    history: createWebHashHistory(), // 使用 Hash 模式，适用于 Electron
    routes
});

export default router;