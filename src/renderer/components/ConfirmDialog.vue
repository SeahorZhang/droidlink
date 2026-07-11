<script setup lang="ts">
defineProps<{
  visible: boolean
  title: string
  message: string
}>()

const emit = defineEmits<{
  confirm: []
  cancel: []
}>()
</script>

<template>
  <Teleport to="body">
    <div
      v-if="visible"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
      @click.self="emit('cancel')"
    >
      <div
        class="w-80 rounded-xl border border-black/8 bg-white p-5 shadow-[0_4px_16px_rgba(0,0,0,0.12)]"
      >
        <h3 class="mb-2 text-[13px] font-medium text-black/80">{{ title }}</h3>
        <p class="mb-5 whitespace-pre-line text-[11px] leading-relaxed text-black/50">
          {{ message }}
        </p>
        <div class="flex justify-end gap-2">
          <button
            class="cursor-pointer rounded-lg px-4 py-1.5 text-[11px] font-medium text-black/50 transition-colors hover:bg-black/5"
            @click="emit('cancel')"
          >
            取消
          </button>
          <button
            class="cursor-pointer rounded-lg bg-red-500 px-4 py-1.5 text-[11px] font-medium text-white transition-colors hover:bg-red-600"
            @click="emit('confirm')"
          >
            确认移除
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
