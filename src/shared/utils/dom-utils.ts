/**
 * DOM utilities for content scripts
 * Provides helpers for DOM manipulation, element finding, and event handling
 */

// ============================================================================
// Element Selection
// ============================================================================

/**
 * Select a single element with type safety
 */
export function querySelector<T extends Element = Element>(
  selector: string,
  parent: ParentNode = document
): T | null {
  return parent.querySelector<T>(selector);
}

/**
 * Select all elements with type safety
 */
export function querySelectorAll<T extends Element = Element>(
  selector: string,
  parent: ParentNode = document
): T[] {
  return Array.from(parent.querySelectorAll<T>(selector));
}

/**
 * Get element by ID with type safety
 */
export function getElementById<T extends HTMLElement = HTMLElement>(
  id: string
): T | null {
  return document.getElementById(id) as T | null;
}

/**
 * Find element matching predicate
 */
export function findElement<T extends Element = Element>(
  selector: string,
  predicate: (element: T) => boolean,
  parent: ParentNode = document
): T | null {
  const elements = querySelectorAll<T>(selector, parent);
  return elements.find(predicate) ?? null;
}

/**
 * Wait for an element to appear in the DOM
 */
export function waitForElement<T extends Element = Element>(
  selector: string,
  options?: {
    timeout?: number;
    parent?: ParentNode;
    checkInterval?: number;
  }
): Promise<T> {
  const { timeout = 10000, parent = document, checkInterval = 100 } = options || {};

  return new Promise((resolve, reject) => {
    // Check if already exists
    const existing = querySelector<T>(selector, parent);
    if (existing) {
      resolve(existing);
      return;
    }

    let timeoutId: ReturnType<typeof setTimeout>;
    let intervalId: ReturnType<typeof setInterval>;

    const cleanup = () => {
      clearTimeout(timeoutId);
      clearInterval(intervalId);
    };

    // Set timeout
    timeoutId = setTimeout(() => {
      cleanup();
      reject(new Error(`Timeout waiting for element: ${selector}`));
    }, timeout);

    // Poll for element
    intervalId = setInterval(() => {
      const element = querySelector<T>(selector, parent);
      if (element) {
        cleanup();
        resolve(element);
      }
    }, checkInterval);
  });
}

/**
 * Wait for element with MutationObserver (more efficient than polling)
 */
export function observeForElement<T extends Element = Element>(
  selector: string,
  options?: {
    timeout?: number;
    parent?: Element;
  }
): Promise<T> {
  const { timeout = 10000, parent = document.body } = options || {};

  return new Promise((resolve, reject) => {
    // Check if already exists
    const existing = querySelector<T>(selector, parent);
    if (existing) {
      resolve(existing);
      return;
    }

    let observer: MutationObserver;
    let timeoutId: ReturnType<typeof setTimeout>;

    const cleanup = () => {
      observer?.disconnect();
      clearTimeout(timeoutId);
    };

    timeoutId = setTimeout(() => {
      cleanup();
      reject(new Error(`Timeout waiting for element: ${selector}`));
    }, timeout);

    observer = new MutationObserver(() => {
      const element = querySelector<T>(selector, parent);
      if (element) {
        cleanup();
        resolve(element);
      }
    });

    observer.observe(parent, {
      childList: true,
      subtree: true,
    });
  });
}

/**
 * Get closest ancestor matching selector
 */
export function closest<T extends Element = Element>(
  element: Element,
  selector: string
): T | null {
  return element.closest<T>(selector);
}

/**
 * Check if element matches selector
 */
export function matches(element: Element, selector: string): boolean {
  return element.matches(selector);
}

// ============================================================================
// Element Creation
// ============================================================================

/**
 * Create an element with attributes and children
 */
export function createElement<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  options?: {
    attributes?: Record<string, string>;
    styles?: Partial<CSSStyleDeclaration>;
    classes?: string[];
    id?: string;
    text?: string;
    html?: string;
    children?: (Element | string)[];
    dataset?: Record<string, string>;
  }
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  const { attributes, styles, classes, id, text, html, children, dataset } = options || {};

  if (id) {
    element.id = id;
  }

  if (classes?.length) {
    element.classList.add(...classes);
  }

  if (attributes) {
    for (const [key, value] of Object.entries(attributes)) {
      element.setAttribute(key, value);
    }
  }

  if (styles) {
    Object.assign(element.style, styles);
  }

  if (dataset) {
    for (const [key, value] of Object.entries(dataset)) {
      element.dataset[key] = value;
    }
  }

  if (text) {
    element.textContent = text;
  } else if (html) {
    element.innerHTML = html;
  }

  if (children?.length) {
    for (const child of children) {
      if (typeof child === 'string') {
        element.appendChild(document.createTextNode(child));
      } else {
        element.appendChild(child);
      }
    }
  }

  return element;
}

/**
 * Create element from HTML string
 */
export function createElementFromHtml<T extends Element = Element>(
  html: string
): T {
  const template = document.createElement('template');
  template.innerHTML = html.trim();
  return template.content.firstElementChild as T;
}

/**
 * Create a document fragment from multiple elements or HTML
 */
export function createFragment(
  content: (Element | string)[]
): DocumentFragment {
  const fragment = document.createDocumentFragment();
  for (const item of content) {
    if (typeof item === 'string') {
      const template = document.createElement('template');
      template.innerHTML = item;
      fragment.appendChild(template.content);
    } else {
      fragment.appendChild(item);
    }
  }
  return fragment;
}

// ============================================================================
// Element Manipulation
// ============================================================================

/**
 * Insert element after reference element
 */
export function insertAfter(
  newElement: Element,
  referenceElement: Element
): void {
  referenceElement.parentNode?.insertBefore(
    newElement,
    referenceElement.nextSibling
  );
}

/**
 * Insert element before reference element
 */
export function insertBefore(
  newElement: Element,
  referenceElement: Element
): void {
  referenceElement.parentNode?.insertBefore(newElement, referenceElement);
}

/**
 * Wrap element with a wrapper
 */
export function wrapElement(element: Element, wrapper: Element): void {
  element.parentNode?.insertBefore(wrapper, element);
  wrapper.appendChild(element);
}

/**
 * Remove element from DOM
 */
export function removeElement(element: Element): void {
  element.remove();
}

/**
 * Replace element with new element
 */
export function replaceElement(
  oldElement: Element,
  newElement: Element
): void {
  oldElement.replaceWith(newElement);
}

/**
 * Clear all children from element
 */
export function clearChildren(element: Element): void {
  while (element.firstChild) {
    element.removeChild(element.firstChild);
  }
}

/**
 * Clone element
 */
export function cloneElement<T extends Element>(
  element: T,
  deep: boolean = true
): T {
  return element.cloneNode(deep) as T;
}

// ============================================================================
// Classes and Attributes
// ============================================================================

/**
 * Add multiple classes
 */
export function addClasses(element: Element, ...classes: string[]): void {
  element.classList.add(...classes);
}

/**
 * Remove multiple classes
 */
export function removeClasses(element: Element, ...classes: string[]): void {
  element.classList.remove(...classes);
}

/**
 * Toggle class with optional force
 */
export function toggleClass(
  element: Element,
  className: string,
  force?: boolean
): boolean {
  return element.classList.toggle(className, force);
}

/**
 * Check if element has class
 */
export function hasClass(element: Element, className: string): boolean {
  return element.classList.contains(className);
}

/**
 * Replace class
 */
export function replaceClass(
  element: Element,
  oldClass: string,
  newClass: string
): void {
  element.classList.replace(oldClass, newClass);
}

/**
 * Set multiple attributes
 */
export function setAttributes(
  element: Element,
  attributes: Record<string, string>
): void {
  for (const [key, value] of Object.entries(attributes)) {
    element.setAttribute(key, value);
  }
}

/**
 * Get attribute with default value
 */
export function getAttribute(
  element: Element,
  name: string,
  defaultValue: string = ''
): string {
  return element.getAttribute(name) ?? defaultValue;
}

/**
 * Remove multiple attributes
 */
export function removeAttributes(element: Element, ...names: string[]): void {
  for (const name of names) {
    element.removeAttribute(name);
  }
}

/**
 * Check if element has attribute
 */
export function hasAttribute(element: Element, name: string): boolean {
  return element.hasAttribute(name);
}

// ============================================================================
// Styles
// ============================================================================

/**
 * Set multiple CSS styles
 */
export function setStyles(
  element: HTMLElement,
  styles: Partial<CSSStyleDeclaration>
): void {
  Object.assign(element.style, styles);
}

/**
 * Get computed style value
 */
export function getComputedStyleValue(
  element: Element,
  property: string
): string {
  return getComputedStyle(element).getPropertyValue(property);
}

/**
 * Set CSS custom property (CSS variable)
 */
export function setCssVariable(
  element: HTMLElement,
  name: string,
  value: string
): void {
  element.style.setProperty(name, value);
}

/**
 * Get CSS custom property value
 */
export function getCssVariable(element: Element, name: string): string {
  return getComputedStyle(element).getPropertyValue(name).trim();
}

/**
 * Hide element
 */
export function hideElement(element: HTMLElement): void {
  element.style.display = 'none';
}

/**
 * Show element
 */
export function showElement(
  element: HTMLElement,
  display: string = 'block'
): void {
  element.style.display = display;
}

/**
 * Check if element is visible
 */
export function isVisible(element: HTMLElement): boolean {
  const style = getComputedStyle(element);
  return (
    style.display !== 'none' &&
    style.visibility !== 'hidden' &&
    style.opacity !== '0'
  );
}

/**
 * Check if element is in viewport
 */
export function isInViewport(
  element: Element,
  partial: boolean = false
): boolean {
  const rect = element.getBoundingClientRect();
  const windowHeight =
    window.innerHeight || document.documentElement.clientHeight;
  const windowWidth = window.innerWidth || document.documentElement.clientWidth;

  if (partial) {
    return (
      rect.top < windowHeight &&
      rect.bottom > 0 &&
      rect.left < windowWidth &&
      rect.right > 0
    );
  }

  return (
    rect.top >= 0 &&
    rect.left >= 0 &&
    rect.bottom <= windowHeight &&
    rect.right <= windowWidth
  );
}

// ============================================================================
// Event Handling
// ============================================================================

/**
 * Add event listener with automatic cleanup
 */
export function addEventListenerWithCleanup<K extends keyof HTMLElementEventMap>(
  element: HTMLElement,
  type: K,
  listener: (event: HTMLElementEventMap[K]) => void,
  options?: boolean | AddEventListenerOptions
): () => void {
  element.addEventListener(type, listener as EventListener, options);
  return () => element.removeEventListener(type, listener as EventListener, options);
}

/**
 * Add one-time event listener
 */
export function addOneTimeListener<K extends keyof HTMLElementEventMap>(
  element: HTMLElement,
  type: K,
  listener: (event: HTMLElementEventMap[K]) => void
): () => void {
  const handler = (event: HTMLElementEventMap[K]) => {
    listener(event);
    element.removeEventListener(type, handler as EventListener);
  };
  element.addEventListener(type, handler as EventListener);
  return () => element.removeEventListener(type, handler as EventListener);
}

/**
 * Delegate event handling to parent element
 */
export function delegate<K extends keyof HTMLElementEventMap>(
  parent: HTMLElement,
  selector: string,
  type: K,
  handler: (event: HTMLElementEventMap[K], target: Element) => void
): () => void {
  const listener = (event: HTMLElementEventMap[K]) => {
    const target = (event.target as Element)?.closest(selector);
    if (target && parent.contains(target)) {
      handler(event, target);
    }
  };
  parent.addEventListener(type, listener as EventListener);
  return () => parent.removeEventListener(type, listener as EventListener);
}

/**
 * Trigger a custom event
 */
export function dispatchCustomEvent<T>(
  element: Element,
  eventName: string,
  detail?: T,
  options?: EventInit
): boolean {
  const event = new CustomEvent(eventName, {
    ...options,
    detail,
  });
  return element.dispatchEvent(event);
}

/**
 * Wait for event to fire
 */
export function waitForEvent<K extends keyof HTMLElementEventMap>(
  element: HTMLElement,
  type: K,
  options?: {
    timeout?: number;
  }
): Promise<HTMLElementEventMap[K]> {
  const { timeout = 10000 } = options || {};

  return new Promise((resolve, reject) => {
    let timeoutId: ReturnType<typeof setTimeout>;

    const handler = (event: HTMLElementEventMap[K]) => {
      clearTimeout(timeoutId);
      element.removeEventListener(type, handler as EventListener);
      resolve(event);
    };

    timeoutId = setTimeout(() => {
      element.removeEventListener(type, handler as EventListener);
      reject(new Error(`Timeout waiting for event: ${type}`));
    }, timeout);

    element.addEventListener(type, handler as EventListener);
  });
}

// ============================================================================
// Data Attributes
// ============================================================================

/**
 * Get data attribute value
 */
export function getData(
  element: HTMLElement,
  key: string
): string | undefined {
  return element.dataset[key];
}

/**
 * Set data attribute
 */
export function setData(
  element: HTMLElement,
  key: string,
  value: string
): void {
  element.dataset[key] = value;
}

/**
 * Set multiple data attributes
 */
export function setDataset(
  element: HTMLElement,
  data: Record<string, string>
): void {
  for (const [key, value] of Object.entries(data)) {
    element.dataset[key] = value;
  }
}

/**
 * Remove data attribute
 */
export function removeData(element: HTMLElement, key: string): void {
  delete element.dataset[key];
}

/**
 * Check if element has data attribute
 */
export function hasData(element: HTMLElement, key: string): boolean {
  return key in element.dataset;
}

// ============================================================================
// Dimensions and Position
// ============================================================================

/**
 * Get element dimensions including margins
 */
export function getOuterDimensions(element: HTMLElement): {
  width: number;
  height: number;
} {
  const style = getComputedStyle(element);
  const marginX =
    parseFloat(style.marginLeft) + parseFloat(style.marginRight);
  const marginY =
    parseFloat(style.marginTop) + parseFloat(style.marginBottom);
  return {
    width: element.offsetWidth + marginX,
    height: element.offsetHeight + marginY,
  };
}

/**
 * Get element position relative to document
 */
export function getOffset(element: Element): { top: number; left: number } {
  const rect = element.getBoundingClientRect();
  return {
    top: rect.top + window.scrollY,
    left: rect.left + window.scrollX,
  };
}

/**
 * Get element position relative to offset parent
 */
export function getPosition(element: HTMLElement): {
  top: number;
  left: number;
} {
  return {
    top: element.offsetTop,
    left: element.offsetLeft,
  };
}

/**
 * Get scroll position of element or window
 */
export function getScrollPosition(
  element?: Element | Window
): { x: number; y: number } {
  if (!element || element === window) {
    return { x: window.scrollX, y: window.scrollY };
  }
  return {
    x: (element as Element).scrollLeft,
    y: (element as Element).scrollTop,
  };
}

/**
 * Scroll element or window to position
 */
export function scrollTo(
  options: ScrollToOptions,
  element?: Element | Window
): void {
  (element || window).scrollTo(options);
}

/**
 * Scroll element into view
 */
export function scrollIntoView(
  element: Element,
  options?: ScrollIntoViewOptions
): void {
  element.scrollIntoView(options);
}

// ============================================================================
// Focus Management
// ============================================================================

/**
 * Focus element
 */
export function focus(
  element: HTMLElement,
  options?: FocusOptions
): void {
  element.focus(options);
}

/**
 * Blur element (remove focus)
 */
export function blur(element: HTMLElement): void {
  element.blur();
}

/**
 * Get active element
 */
export function getActiveElement(): Element | null {
  return document.activeElement;
}

/**
 * Get all focusable elements within container
 */
export function getFocusableElements(
  container: Element = document.body
): HTMLElement[] {
  const selector = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
  ].join(',');

  return querySelectorAll<HTMLElement>(selector, container);
}

/**
 * Trap focus within container
 */
export function trapFocus(container: HTMLElement): () => void {
  const focusableElements = getFocusableElements(container);
  const firstElement = focusableElements[0];
  const lastElement = focusableElements[focusableElements.length - 1];

  const handler = (event: KeyboardEvent) => {
    if (event.key !== 'Tab') return;

    if (event.shiftKey) {
      if (document.activeElement === firstElement) {
        event.preventDefault();
        lastElement?.focus();
      }
    } else {
      if (document.activeElement === lastElement) {
        event.preventDefault();
        firstElement?.focus();
      }
    }
  };

  container.addEventListener('keydown', handler);
  return () => container.removeEventListener('keydown', handler);
}

// ============================================================================
// Video Element Utilities
// ============================================================================

/**
 * Find video element in container or document
 */
export function findVideoElement(
  container?: Element
): HTMLVideoElement | null {
  return querySelector<HTMLVideoElement>('video', container || document);
}

/**
 * Find all video elements
 */
export function findAllVideoElements(
  container?: Element
): HTMLVideoElement[] {
  return querySelectorAll<HTMLVideoElement>('video', container || document);
}

/**
 * Get current video time in seconds
 */
export function getVideoTime(video: HTMLVideoElement): number {
  return video.currentTime;
}

/**
 * Set video time
 */
export function setVideoTime(
  video: HTMLVideoElement,
  time: number
): void {
  video.currentTime = time;
}

/**
 * Check if video is playing
 */
export function isVideoPlaying(video: HTMLVideoElement): boolean {
  return !video.paused && !video.ended && video.readyState > 2;
}

/**
 * Get video duration
 */
export function getVideoDuration(video: HTMLVideoElement): number {
  return video.duration;
}

/**
 * Get video progress (0-1)
 */
export function getVideoProgress(video: HTMLVideoElement): number {
  if (!video.duration) return 0;
  return video.currentTime / video.duration;
}

/**
 * Wait for video to be ready
 */
export function waitForVideoReady(
  video: HTMLVideoElement,
  options?: { timeout?: number }
): Promise<void> {
  const { timeout = 10000 } = options || {};

  return new Promise((resolve, reject) => {
    if (video.readyState >= 3) {
      resolve();
      return;
    }

    let timeoutId: ReturnType<typeof setTimeout>;

    const handler = () => {
      clearTimeout(timeoutId);
      video.removeEventListener('canplay', handler);
      resolve();
    };

    timeoutId = setTimeout(() => {
      video.removeEventListener('canplay', handler);
      reject(new Error('Timeout waiting for video ready'));
    }, timeout);

    video.addEventListener('canplay', handler);
  });
}

// ============================================================================
// Mutation Observation
// ============================================================================

/**
 * Observe DOM mutations
 */
export function observeMutations(
  target: Node,
  callback: MutationCallback,
  options?: MutationObserverInit
): () => void {
  const observer = new MutationObserver(callback);
  observer.observe(target, {
    childList: true,
    subtree: true,
    ...options,
  });
  return () => observer.disconnect();
}

/**
 * Observe element attribute changes
 */
export function observeAttributes(
  element: Element,
  callback: (attributeName: string, oldValue: string | null) => void,
  attributeFilter?: string[]
): () => void {
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'attributes' && mutation.attributeName) {
        callback(mutation.attributeName, mutation.oldValue);
      }
    }
  });

  observer.observe(element, {
    attributes: true,
    attributeOldValue: true,
    attributeFilter,
  });

  return () => observer.disconnect();
}

/**
 * Observe element resize
 */
export function observeResize(
  element: Element,
  callback: (entry: ResizeObserverEntry) => void
): () => void {
  const observer = new ResizeObserver((entries) => {
    for (const entry of entries) {
      callback(entry);
    }
  });
  observer.observe(element);
  return () => observer.disconnect();
}

/**
 * Observe element intersection with viewport
 */
export function observeIntersection(
  element: Element,
  callback: (entry: IntersectionObserverEntry) => void,
  options?: IntersectionObserverInit
): () => void {
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      callback(entry);
    }
  }, options);
  observer.observe(element);
  return () => observer.disconnect();
}
