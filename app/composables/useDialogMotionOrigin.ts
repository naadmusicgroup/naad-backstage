import { onMounted } from "vue"

const interactiveOriginSelector = [
  "[data-dialog-origin]",
  "button",
  "a[href]",
  "[role='button']",
  "input[type='button']",
  "input[type='submit']",
  "input[type='reset']",
  "label",
  "summary",
].join(",")

let isDialogMotionListenerInstalled = false

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function rounded(value: number) {
  return Math.round(value * 100) / 100
}

function numericDataAttribute(element: Element, name: string) {
  if (!(element instanceof HTMLElement)) {
    return null
  }

  const rawValue = element.dataset[name]

  if (!rawValue) {
    return null
  }

  const value = Number(rawValue)
  return Number.isFinite(value) ? value : null
}

function setCenteredDialogOrigin() {
  if (!import.meta.client) {
    return
  }

  const root = document.documentElement
  root.style.setProperty("--dialog-origin-dx", "0px")
  root.style.setProperty("--dialog-origin-dy", "0px")
  root.style.setProperty("--dialog-origin-scale", "0.92")
  root.style.setProperty("--dialog-origin-radius", "22px")
  root.style.setProperty("--dialog-origin-transform", "50% 50%")
}

function setDialogMotionOriginFromElement(element: Element) {
  if (!import.meta.client) {
    return
  }

  const rect = element.getBoundingClientRect()

  if (!rect.width || !rect.height) {
    setCenteredDialogOrigin()
    return
  }

  const viewportCenterX = window.innerWidth / 2
  const viewportCenterY = window.innerHeight / 2
  const originX = rect.left + rect.width / 2
  const originY = rect.top + rect.height / 2
  const maxDx = Math.max(0, viewportCenterX - 24)
  const maxDy = Math.max(0, viewportCenterY - 24)
  const dx = clamp(originX - viewportCenterX, -maxDx, maxDx)
  const dy = clamp(originY - viewportCenterY, -maxDy, maxDy)
  const triggerArea = Math.max(1, rect.width * rect.height)
  const modalArea = 560 * 420
  const scaleOverride = numericDataAttribute(element, "dialogOriginScale")
  const radiusOverride = numericDataAttribute(element, "dialogOriginRadius")
  const originScale = scaleOverride === null
    ? clamp(Math.sqrt(triggerArea / modalArea) * 2.2, 0.54, 0.9)
    : clamp(scaleOverride, 0.34, 0.94)
  const originRadius = radiusOverride === null
    ? clamp(Math.min(rect.width, rect.height) / 2, 10, 28)
    : clamp(radiusOverride, 8, 32)
  const transformX = clamp((originX / Math.max(window.innerWidth, 1)) * 100, 0, 100)
  const transformY = clamp((originY / Math.max(window.innerHeight, 1)) * 100, 0, 100)
  const root = document.documentElement

  root.style.setProperty("--dialog-origin-dx", `${rounded(dx)}px`)
  root.style.setProperty("--dialog-origin-dy", `${rounded(dy)}px`)
  root.style.setProperty("--dialog-origin-scale", String(rounded(originScale)))
  root.style.setProperty("--dialog-origin-radius", `${rounded(originRadius)}px`)
  root.style.setProperty("--dialog-origin-transform", `${rounded(transformX)}% ${rounded(transformY)}%`)
}

function shouldIgnoreDialogMotionTarget(target: HTMLElement) {
  return Boolean(target.closest(".dialog-morph-content, .dialog-morph-scroll-content"))
}

function findDialogMotionOriginTarget(event: Event) {
  const target = event.target

  if (!(target instanceof HTMLElement) || shouldIgnoreDialogMotionTarget(target)) {
    return null
  }

  return target.closest(interactiveOriginSelector)
}

function handleDialogMotionPointer(event: Event) {
  const originTarget = findDialogMotionOriginTarget(event)

  if (originTarget) {
    setDialogMotionOriginFromElement(originTarget)
  }
}

function handleDialogMotionKeyboard(event: KeyboardEvent) {
  if (event.key !== "Enter" && event.key !== " ") {
    return
  }

  const activeElement = document.activeElement

  if (!(activeElement instanceof HTMLElement) || shouldIgnoreDialogMotionTarget(activeElement)) {
    return
  }

  const originTarget = activeElement.closest(interactiveOriginSelector)

  if (originTarget) {
    setDialogMotionOriginFromElement(originTarget)
  }
}

function installDialogMotionOriginListener() {
  if (!import.meta.client || isDialogMotionListenerInstalled) {
    return
  }

  isDialogMotionListenerInstalled = true
  setCenteredDialogOrigin()
  document.addEventListener("pointerdown", handleDialogMotionPointer, { capture: true, passive: true })
  document.addEventListener("click", handleDialogMotionPointer, { capture: true, passive: true })
  document.addEventListener("keydown", handleDialogMotionKeyboard, { capture: true })
}

export function useDialogMotionOrigin() {
  onMounted(() => {
    installDialogMotionOriginListener()
  })

  return {
    setDialogMotionOriginFromElement,
  }
}
