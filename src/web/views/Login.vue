<script setup lang="ts">
import { ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Icon } from '@iconify/vue';
import { verifyToken, setToken } from '@/auth';
import ThemeToggle from '@/components/ThemeToggle.vue';
import Logo from '@/components/Logo.vue';

const route = useRoute();
const router = useRouter();
const password = ref('');
const isSubmitting = ref(false);
const errorMessage = ref('');

const login = async () => {
  errorMessage.value = '';
  const token = password.value.trim();

  if (!token) {
    errorMessage.value = 'Please enter your Auth Token.';
    return;
  }

  isSubmitting.value = true;
  try {
    const isValid = await verifyToken(token);
    if (!isValid) {
      errorMessage.value = 'Invalid token. Please check and try again.';
      return;
    }

    setToken(token);
    const redirectTo = (route.query.redirect as string) || '/';
    router.replace(redirectTo);
  } catch {
    errorMessage.value = 'System error. Please try again later.';
  } finally {
    isSubmitting.value = false;
  }
};
</script>

<template>
  <div class="min-h-dvh w-full flex items-center justify-center p-4 relative overflow-hidden">
    <!-- Login Card -->
    <div
      class="w-full max-w-sm bg-card border border-border-subtle rounded-3xl shadow-float p-7 z-10 relative flex flex-col gap-8 min-w-[320px]">

      <!-- Top Section: Brand & Toggle -->
      <div class="flex justify-between items-start">
        <div class="flex items-center gap-3.5">
          <Logo />
          <!-- Brand Text -->
          <div class="flex flex-col justify-center">
            <h2 class="text-xl font-bold text-text-primary leading-tight tracking-tight">CARP</h2>
            <p class="text-sm text-text-secondary font-medium leading-snug opacity-90">Cloudflare AI
              Rotating Proxy</p>
          </div>
        </div>
        <!-- Theme Toggle -->
        <ThemeToggle class="shrink-0" />
      </div>

      <!-- Welcome Title -->
      <h1 class="text-2xl font-bold text-text-primary tracking-tight">Welcome!</h1>

      <!-- Form -->
      <form @submit.prevent="login" class="space-y-5">
        <div class="space-y-2">
          <div class="relative">
            <input id="token" type="password" v-model="password" @input="errorMessage = ''"
              placeholder="Enter Auth Token"
              class="w-full bg-app border border-border-subtle text-text-primary rounded-xl px-4 py-3.5 text-base sm:text-sm outline-none focus:border-border-focus focus:ring-2 focus:ring-border-focus/20 transition duration-200 placeholder:text-text-secondary placeholder:opacity-50 shadow-sm"
              :disabled="isSubmitting" autofocus />
          </div>
        </div>

        <!-- Error Message -->
        <div v-if="errorMessage"
          class="bg-status-error border border-status-error-border rounded-lg p-3 flex items-start gap-3">
          <Icon icon="lucide:alert-circle" class="h-5 w-5 text-status-error-text shrink-0" />
          <p class="text-sm text-status-error-text font-medium">{{ errorMessage }}</p>
        </div>

        <button type="submit" :disabled="isSubmitting || !password"
          class="w-full bg-brand text-brand-on font-semibold py-3.5 text-base sm:text-sm rounded-xl shadow-md active:shadow-sm disabled:opacity-40 disabled:cursor-not-allowed transition duration-200 flex justify-center items-center group cursor-pointer">
          <span v-if="!isSubmitting">Login</span>
          <span v-else class="flex items-center gap-2">
            <Icon icon="lucide:loader-2" class="animate-spin h-5 w-5" />
            Login...
          </span>
        </button>
      </form>

      <!-- Security Note -->
      <div class="bg-app/90 border border-border-subtle/60 rounded-xl p-4 flex items-center gap-3">
        <div class="p-2 bg-card rounded-lg text-brand shadow-sm shrink-0 ring-1 ring-border-subtle">
          <Icon icon="lucide:shield-check" class="h-5 w-5" />
        </div>
        <div>
          <h3 class="text-sm font-semibold text-text-primary">Security</h3>
          <p class="text-xs text-text-secondary mt-0.5 leading-relaxed">
            Rotate tokens often and revoke them if exposed.
          </p>
        </div>
      </div>

    </div>
  </div>
</template>

<style scoped></style>
