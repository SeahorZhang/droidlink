<script setup lang="ts">
import BaseButton from './BaseButton.vue'

const props = defineProps<{
  settings: { maxSize: number; bitRate: string }
}>()

const emit = defineEmits<{
  'update:settings': [settings: { maxSize: number; bitRate: string }]
}>()

const resolutionOptions = [
  { label: '不限制', value: 0 },
  { label: '1K', value: 1080 },
  { label: '2K', value: 1440 },
  { label: '4K', value: 2160 }
]

const bitRateOptions = ['8M', '16M', '24M', '32M', '50M']

const setResolution = (value: number): void => {
  emit('update:settings', { ...props.settings, maxSize: value })
}

const setBitRate = (value: string): void => {
  emit('update:settings', { ...props.settings, bitRate: value })
}
</script>

<template>
  <div class="space-y-5">
    <div>
      <span class="mb-2 block text-[10px] tracking-wider text-black/40 uppercase">分辨率</span>
      <div class="flex gap-1.5">
        <BaseButton
          v-for="opt in resolutionOptions"
          :key="opt.value"
          :active="settings.maxSize === opt.value"
          @click="setResolution(opt.value)"
        >
          {{ opt.label }}
        </BaseButton>
      </div>
    </div>
    <div>
      <span class="mb-2 block text-[10px] tracking-wider text-black/40 uppercase">码率</span>
      <div class="flex gap-1.5">
        <BaseButton
          v-for="br in bitRateOptions"
          :key="br"
          :active="settings.bitRate === br"
          @click="setBitRate(br)"
        >
          {{ br }}
        </BaseButton>
      </div>
    </div>
  </div>
</template>
