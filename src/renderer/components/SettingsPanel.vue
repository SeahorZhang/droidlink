<script setup lang="ts">
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
      <span class="mb-2 block text-[10px] tracking-wider text-white/30 uppercase">分辨率</span>
      <div class="flex gap-1.5">
        <button
          v-for="opt in resolutionOptions"
          :key="opt.value"
          :class="[
            'cursor-pointer rounded-md px-2.5 py-1 text-[11px] transition-all',
            settings.maxSize === opt.value
              ? 'border border-white/20 bg-white/15 text-white'
              : 'border border-transparent text-white/30 hover:bg-white/5 hover:text-white/50'
          ]"
          @click="setResolution(opt.value)"
        >
          {{ opt.label }}
        </button>
      </div>
    </div>
    <div>
      <span class="mb-2 block text-[10px] tracking-wider text-white/30 uppercase">码率</span>
      <div class="flex gap-1.5">
        <button
          v-for="br in bitRateOptions"
          :key="br"
          :class="[
            'cursor-pointer rounded-md px-2.5 py-1 text-[11px] transition-all',
            settings.bitRate === br
              ? 'border border-white/20 bg-white/15 text-white'
              : 'border border-transparent text-white/30 hover:bg-white/5 hover:text-white/50'
          ]"
          @click="setBitRate(br)"
        >
          {{ br }}
        </button>
      </div>
    </div>
  </div>
</template>
