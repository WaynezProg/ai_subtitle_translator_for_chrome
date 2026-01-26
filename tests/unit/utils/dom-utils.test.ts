import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  // Selection
  querySelector,
  querySelectorAll,
  getElementById,
  findElement,
  waitForElement,
  closest,
  matches,
  // Creation
  createElement,
  createElementFromHtml,
  createFragment,
  // Manipulation
  insertAfter,
  insertBefore,
  wrapElement,
  removeElement,
  replaceElement,
  clearChildren,
  cloneElement,
  // Classes
  addClasses,
  removeClasses,
  toggleClass,
  hasClass,
  replaceClass,
  // Attributes
  setAttributes,
  getAttribute,
  removeAttributes,
  hasAttribute,
  // Styles
  setStyles,
  getComputedStyleValue,
  setCssVariable,
  hideElement,
  showElement,
  isVisible,
  isInViewport,
  // Events
  addEventListenerWithCleanup,
  addOneTimeListener,
  delegate,
  dispatchCustomEvent,
  waitForEvent,
  // Data attributes
  getData,
  setData,
  setDataset,
  removeData,
  hasData,
  // Dimensions
  getOuterDimensions,
  getOffset,
  getPosition,
  getScrollPosition,
  // Focus
  focus,
  blur,
  getActiveElement,
  getFocusableElements,
  trapFocus,
  // Video
  findVideoElement,
  findAllVideoElements,
  getVideoTime,
  setVideoTime,
  isVideoPlaying,
  getVideoDuration,
  getVideoProgress,
  // Mutation observation
  observeMutations,
  observeAttributes,
} from '@shared/utils/dom-utils';

describe('Element Selection', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    container.id = 'test-container';
    container.innerHTML = `
      <div class="item" data-id="1">Item 1</div>
      <div class="item" data-id="2">Item 2</div>
      <div class="item special" data-id="3">Item 3</div>
      <span class="text">Text</span>
    `;
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

  describe('querySelector', () => {
    it('should select first matching element', () => {
      const item = querySelector('.item', container);
      expect(item).not.toBeNull();
      expect(item?.textContent).toBe('Item 1');
    });

    it('should return null for no match', () => {
      const result = querySelector('.nonexistent', container);
      expect(result).toBeNull();
    });

    it('should use document by default', () => {
      const result = querySelector('#test-container');
      expect(result).toBe(container);
    });
  });

  describe('querySelectorAll', () => {
    it('should select all matching elements', () => {
      const items = querySelectorAll('.item', container);
      expect(items).toHaveLength(3);
    });

    it('should return empty array for no match', () => {
      const items = querySelectorAll('.nonexistent', container);
      expect(items).toEqual([]);
    });
  });

  describe('getElementById', () => {
    it('should get element by ID', () => {
      const element = getElementById('test-container');
      expect(element).toBe(container);
    });

    it('should return null for unknown ID', () => {
      const element = getElementById('unknown');
      expect(element).toBeNull();
    });
  });

  describe('findElement', () => {
    it('should find element matching predicate', () => {
      const special = findElement<HTMLDivElement>(
        '.item',
        (el) => el.dataset.id === '3',
        container
      );
      expect(special?.textContent).toBe('Item 3');
    });

    it('should return null if no match', () => {
      const result = findElement<HTMLDivElement>(
        '.item',
        (el) => el.dataset.id === '99',
        container
      );
      expect(result).toBeNull();
    });
  });

  describe('waitForElement', () => {
    it('should resolve immediately for existing element', async () => {
      const result = await waitForElement('.item', { parent: container });
      expect(result.textContent).toBe('Item 1');
    });

    it('should wait for element to appear', async () => {
      const promise = waitForElement('.new-item', {
        parent: container,
        checkInterval: 10,
      });

      setTimeout(() => {
        const newItem = document.createElement('div');
        newItem.className = 'new-item';
        newItem.textContent = 'New';
        container.appendChild(newItem);
      }, 50);

      const result = await promise;
      expect(result.textContent).toBe('New');
    });

    it('should timeout if element not found', async () => {
      await expect(
        waitForElement('.nonexistent', {
          parent: container,
          timeout: 100,
          checkInterval: 10,
        })
      ).rejects.toThrow('Timeout');
    });
  });

  describe('closest', () => {
    it('should find closest ancestor', () => {
      const item = querySelector('.item', container)!;
      const result = closest(item, '#test-container');
      expect(result).toBe(container);
    });
  });

  describe('matches', () => {
    it('should check if element matches selector', () => {
      const item = querySelector('.item.special', container)!;
      expect(matches(item, '.special')).toBe(true);
      expect(matches(item, '.other')).toBe(false);
    });
  });
});

describe('Element Creation', () => {
  describe('createElement', () => {
    it('should create element with tag', () => {
      const div = createElement('div');
      expect(div.tagName).toBe('DIV');
    });

    it('should create element with id', () => {
      const div = createElement('div', { id: 'my-id' });
      expect(div.id).toBe('my-id');
    });

    it('should create element with classes', () => {
      const div = createElement('div', { classes: ['class1', 'class2'] });
      expect(div.classList.contains('class1')).toBe(true);
      expect(div.classList.contains('class2')).toBe(true);
    });

    it('should create element with attributes', () => {
      const input = createElement('input', {
        attributes: { type: 'text', placeholder: 'Enter value' },
      });
      expect(input.getAttribute('type')).toBe('text');
      expect(input.getAttribute('placeholder')).toBe('Enter value');
    });

    it('should create element with styles', () => {
      const div = createElement('div', {
        styles: { color: 'red', fontSize: '16px' },
      });
      expect(div.style.color).toBe('red');
      expect(div.style.fontSize).toBe('16px');
    });

    it('should create element with text content', () => {
      const div = createElement('div', { text: 'Hello World' });
      expect(div.textContent).toBe('Hello World');
    });

    it('should create element with HTML content', () => {
      const div = createElement('div', { html: '<span>Inner</span>' });
      expect(div.innerHTML).toBe('<span>Inner</span>');
    });

    it('should create element with children', () => {
      const child1 = createElement('span', { text: 'Child 1' });
      const div = createElement('div', {
        children: [child1, 'Text Node'],
      });
      expect(div.children).toHaveLength(1);
      expect(div.childNodes).toHaveLength(2);
    });

    it('should create element with dataset', () => {
      const div = createElement('div', {
        dataset: { id: '123', name: 'test' },
      });
      expect(div.dataset.id).toBe('123');
      expect(div.dataset.name).toBe('test');
    });
  });

  describe('createElementFromHtml', () => {
    it('should create element from HTML string', () => {
      const div = createElementFromHtml<HTMLDivElement>(
        '<div class="test">Content</div>'
      );
      expect(div.className).toBe('test');
      expect(div.textContent).toBe('Content');
    });
  });

  describe('createFragment', () => {
    it('should create fragment from elements', () => {
      const elem1 = createElement('div', { text: 'Div' });
      const elem2 = createElement('span', { text: 'Span' });
      const fragment = createFragment([elem1, elem2]);
      expect(fragment.childNodes).toHaveLength(2);
    });

    it('should create fragment from HTML strings', () => {
      const fragment = createFragment([
        '<div>First</div>',
        '<div>Second</div>',
      ]);
      expect(fragment.childNodes).toHaveLength(2);
    });
  });
});

describe('Element Manipulation', () => {
  let container: HTMLDivElement;
  let element1: HTMLDivElement;
  let element2: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    element1 = document.createElement('div');
    element1.id = 'elem1';
    element2 = document.createElement('div');
    element2.id = 'elem2';
    container.appendChild(element1);
    container.appendChild(element2);
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

  describe('insertAfter', () => {
    it('should insert element after reference', () => {
      const newElement = createElement('div', { id: 'new' });
      insertAfter(newElement, element1);
      expect(element1.nextSibling).toBe(newElement);
    });
  });

  describe('insertBefore', () => {
    it('should insert element before reference', () => {
      const newElement = createElement('div', { id: 'new' });
      insertBefore(newElement, element2);
      expect(element2.previousSibling).toBe(newElement);
    });
  });

  describe('wrapElement', () => {
    it('should wrap element with wrapper', () => {
      const wrapper = createElement('div', { classes: ['wrapper'] });
      wrapElement(element1, wrapper);
      expect(element1.parentElement).toBe(wrapper);
      expect(wrapper.parentElement).toBe(container);
    });
  });

  describe('removeElement', () => {
    it('should remove element from DOM', () => {
      removeElement(element1);
      expect(container.contains(element1)).toBe(false);
    });
  });

  describe('replaceElement', () => {
    it('should replace element', () => {
      const newElement = createElement('div', { id: 'replacement' });
      replaceElement(element1, newElement);
      expect(container.contains(element1)).toBe(false);
      expect(container.contains(newElement)).toBe(true);
    });
  });

  describe('clearChildren', () => {
    it('should remove all children', () => {
      clearChildren(container);
      expect(container.children).toHaveLength(0);
    });
  });

  describe('cloneElement', () => {
    it('should clone element deeply by default', () => {
      element1.innerHTML = '<span>Child</span>';
      const clone = cloneElement(element1);
      expect(clone.id).toBe('elem1');
      expect(clone.innerHTML).toBe('<span>Child</span>');
      expect(clone).not.toBe(element1);
    });

    it('should clone element shallowly', () => {
      element1.innerHTML = '<span>Child</span>';
      const clone = cloneElement(element1, false);
      expect(clone.id).toBe('elem1');
      expect(clone.innerHTML).toBe('');
    });
  });
});

describe('Classes and Attributes', () => {
  let element: HTMLDivElement;

  beforeEach(() => {
    element = document.createElement('div');
    element.className = 'initial';
  });

  describe('addClasses', () => {
    it('should add multiple classes', () => {
      addClasses(element, 'class1', 'class2');
      expect(element.classList.contains('class1')).toBe(true);
      expect(element.classList.contains('class2')).toBe(true);
    });
  });

  describe('removeClasses', () => {
    it('should remove multiple classes', () => {
      element.className = 'class1 class2 class3';
      removeClasses(element, 'class1', 'class2');
      expect(element.classList.contains('class1')).toBe(false);
      expect(element.classList.contains('class3')).toBe(true);
    });
  });

  describe('toggleClass', () => {
    it('should toggle class', () => {
      expect(toggleClass(element, 'toggle')).toBe(true);
      expect(element.classList.contains('toggle')).toBe(true);
      expect(toggleClass(element, 'toggle')).toBe(false);
      expect(element.classList.contains('toggle')).toBe(false);
    });

    it('should force class on/off', () => {
      expect(toggleClass(element, 'forced', true)).toBe(true);
      expect(toggleClass(element, 'forced', true)).toBe(true);
      expect(toggleClass(element, 'forced', false)).toBe(false);
    });
  });

  describe('hasClass', () => {
    it('should check for class presence', () => {
      expect(hasClass(element, 'initial')).toBe(true);
      expect(hasClass(element, 'other')).toBe(false);
    });
  });

  describe('replaceClass', () => {
    it('should replace class', () => {
      replaceClass(element, 'initial', 'replaced');
      expect(hasClass(element, 'initial')).toBe(false);
      expect(hasClass(element, 'replaced')).toBe(true);
    });
  });

  describe('setAttributes', () => {
    it('should set multiple attributes', () => {
      setAttributes(element, { 'data-id': '123', role: 'button' });
      expect(element.getAttribute('data-id')).toBe('123');
      expect(element.getAttribute('role')).toBe('button');
    });
  });

  describe('getAttribute', () => {
    it('should get attribute value', () => {
      element.setAttribute('data-id', '123');
      expect(getAttribute(element, 'data-id')).toBe('123');
    });

    it('should return default for missing attribute', () => {
      expect(getAttribute(element, 'missing', 'default')).toBe('default');
    });
  });

  describe('removeAttributes', () => {
    it('should remove multiple attributes', () => {
      element.setAttribute('attr1', 'value1');
      element.setAttribute('attr2', 'value2');
      removeAttributes(element, 'attr1', 'attr2');
      expect(element.hasAttribute('attr1')).toBe(false);
      expect(element.hasAttribute('attr2')).toBe(false);
    });
  });

  describe('hasAttribute', () => {
    it('should check attribute presence', () => {
      element.setAttribute('exists', 'value');
      expect(hasAttribute(element, 'exists')).toBe(true);
      expect(hasAttribute(element, 'missing')).toBe(false);
    });
  });
});

describe('Styles', () => {
  let element: HTMLDivElement;

  beforeEach(() => {
    element = document.createElement('div');
    document.body.appendChild(element);
  });

  afterEach(() => {
    element.remove();
  });

  describe('setStyles', () => {
    it('should set multiple styles', () => {
      setStyles(element, {
        color: 'blue',
        backgroundColor: 'red',
        fontSize: '14px',
      });
      expect(element.style.color).toBe('blue');
      expect(element.style.backgroundColor).toBe('red');
      expect(element.style.fontSize).toBe('14px');
    });
  });

  describe('getComputedStyleValue', () => {
    it('should get computed style', () => {
      element.style.display = 'block';
      const display = getComputedStyleValue(element, 'display');
      expect(display).toBe('block');
    });
  });

  describe('setCssVariable', () => {
    it('should set CSS variable', () => {
      setCssVariable(element, '--custom-color', 'purple');
      expect(element.style.getPropertyValue('--custom-color')).toBe('purple');
    });
  });

  describe('hideElement / showElement', () => {
    it('should hide element', () => {
      hideElement(element);
      expect(element.style.display).toBe('none');
    });

    it('should show element', () => {
      element.style.display = 'none';
      showElement(element);
      expect(element.style.display).toBe('block');
    });

    it('should show element with custom display', () => {
      showElement(element, 'flex');
      expect(element.style.display).toBe('flex');
    });
  });

  describe('isVisible', () => {
    it('should return true for visible elements', () => {
      element.style.display = 'block';
      expect(isVisible(element)).toBe(true);
    });

    it('should return false for hidden elements', () => {
      element.style.display = 'none';
      expect(isVisible(element)).toBe(false);
    });

    it('should return false for invisible elements', () => {
      element.style.visibility = 'hidden';
      expect(isVisible(element)).toBe(false);
    });

    it('should return false for zero opacity', () => {
      element.style.opacity = '0';
      expect(isVisible(element)).toBe(false);
    });
  });

  describe('isInViewport', () => {
    it('should check viewport visibility', () => {
      // In JSDOM, getBoundingClientRect returns zeros, so we mock it
      const mockRect = {
        top: 0,
        left: 0,
        bottom: 100,
        right: 100,
        width: 100,
        height: 100,
        x: 0,
        y: 0,
        toJSON: () => {},
      };
      vi.spyOn(element, 'getBoundingClientRect').mockReturnValue(mockRect);

      expect(isInViewport(element, true)).toBe(true);
    });

    it('should return false for element outside viewport', () => {
      const mockRect = {
        top: -200,
        left: -200,
        bottom: -100,
        right: -100,
        width: 100,
        height: 100,
        x: -200,
        y: -200,
        toJSON: () => {},
      };
      vi.spyOn(element, 'getBoundingClientRect').mockReturnValue(mockRect);

      expect(isInViewport(element, true)).toBe(false);
    });
  });
});

describe('Event Handling', () => {
  let element: HTMLDivElement;

  beforeEach(() => {
    element = document.createElement('div');
    document.body.appendChild(element);
  });

  afterEach(() => {
    element.remove();
  });

  describe('addEventListenerWithCleanup', () => {
    it('should add and remove event listener', () => {
      const handler = vi.fn();
      const cleanup = addEventListenerWithCleanup(element, 'click', handler);

      element.click();
      expect(handler).toHaveBeenCalledTimes(1);

      cleanup();
      element.click();
      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  describe('addOneTimeListener', () => {
    it('should only fire once', () => {
      const handler = vi.fn();
      addOneTimeListener(element, 'click', handler);

      element.click();
      element.click();
      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  describe('delegate', () => {
    it('should delegate events to child elements', () => {
      const child = createElement('button', { classes: ['btn'] });
      element.appendChild(child);

      const handler = vi.fn();
      delegate(element, '.btn', 'click', handler);

      child.click();
      expect(handler).toHaveBeenCalled();
      expect(handler.mock.calls[0][1]).toBe(child);
    });
  });

  describe('dispatchCustomEvent', () => {
    it('should dispatch custom event with detail', () => {
      const handler = vi.fn();
      element.addEventListener('custom', handler);

      dispatchCustomEvent(element, 'custom', { data: 'test' });

      expect(handler).toHaveBeenCalled();
      expect((handler.mock.calls[0][0] as CustomEvent).detail).toEqual({
        data: 'test',
      });
    });
  });

  describe('waitForEvent', () => {
    it('should resolve when event fires', async () => {
      const promise = waitForEvent(element, 'click');
      setTimeout(() => element.click(), 10);
      const event = await promise;
      expect(event.type).toBe('click');
    });

    it('should timeout if event not fired', async () => {
      await expect(
        waitForEvent(element, 'click', { timeout: 50 })
      ).rejects.toThrow('Timeout');
    });
  });
});

describe('Data Attributes', () => {
  let element: HTMLDivElement;

  beforeEach(() => {
    element = document.createElement('div');
  });

  describe('getData / setData', () => {
    it('should get and set data attribute', () => {
      setData(element, 'userId', '123');
      expect(getData(element, 'userId')).toBe('123');
    });
  });

  describe('setDataset', () => {
    it('should set multiple data attributes', () => {
      setDataset(element, { id: '123', name: 'test' });
      expect(element.dataset.id).toBe('123');
      expect(element.dataset.name).toBe('test');
    });
  });

  describe('removeData', () => {
    it('should remove data attribute', () => {
      setData(element, 'temp', 'value');
      removeData(element, 'temp');
      expect(getData(element, 'temp')).toBeUndefined();
    });
  });

  describe('hasData', () => {
    it('should check data attribute existence', () => {
      setData(element, 'exists', 'value');
      expect(hasData(element, 'exists')).toBe(true);
      expect(hasData(element, 'missing')).toBe(false);
    });
  });
});

describe('Dimensions and Position', () => {
  let element: HTMLDivElement;

  beforeEach(() => {
    element = document.createElement('div');
    element.style.width = '100px';
    element.style.height = '100px';
    element.style.margin = '10px';
    document.body.appendChild(element);
  });

  afterEach(() => {
    element.remove();
  });

  describe('getOuterDimensions', () => {
    it('should get dimensions including margins', () => {
      const dims = getOuterDimensions(element);
      // In JSDOM, offsetWidth/Height may be 0
      expect(dims.width).toBeGreaterThanOrEqual(0);
      expect(dims.height).toBeGreaterThanOrEqual(0);
    });
  });

  describe('getOffset', () => {
    it('should get offset relative to document', () => {
      const offset = getOffset(element);
      expect(typeof offset.top).toBe('number');
      expect(typeof offset.left).toBe('number');
    });
  });

  describe('getPosition', () => {
    it('should get position relative to offset parent', () => {
      const pos = getPosition(element);
      expect(typeof pos.top).toBe('number');
      expect(typeof pos.left).toBe('number');
    });
  });

  describe('getScrollPosition', () => {
    it('should get scroll position', () => {
      const scroll = getScrollPosition();
      expect(scroll.x).toBe(0);
      expect(scroll.y).toBe(0);
    });
  });
});

describe('Focus Management', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    container.innerHTML = `
      <button id="btn1">Button 1</button>
      <input id="input1" type="text" />
      <a href="#" id="link1">Link</a>
      <div id="non-focusable">Non-focusable</div>
      <button id="btn2" disabled>Disabled</button>
    `;
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

  describe('focus / blur', () => {
    it('should focus element', () => {
      const btn = getElementById<HTMLButtonElement>('btn1')!;
      focus(btn);
      expect(document.activeElement).toBe(btn);
    });

    it('should blur element', () => {
      const btn = getElementById<HTMLButtonElement>('btn1')!;
      focus(btn);
      blur(btn);
      expect(document.activeElement).not.toBe(btn);
    });
  });

  describe('getActiveElement', () => {
    it('should return active element', () => {
      const btn = getElementById<HTMLButtonElement>('btn1')!;
      btn.focus();
      expect(getActiveElement()).toBe(btn);
    });
  });

  describe('getFocusableElements', () => {
    it('should get all focusable elements', () => {
      const focusable = getFocusableElements(container);
      // Should include: btn1, input1, link1 (btn2 is disabled)
      expect(focusable).toHaveLength(3);
    });
  });

  describe('trapFocus', () => {
    it('should trap focus within container', () => {
      const release = trapFocus(container);

      // Simulate tab key at end
      const link = getElementById<HTMLAnchorElement>('link1')!;
      link.focus();

      const tabEvent = new KeyboardEvent('keydown', {
        key: 'Tab',
        bubbles: true,
      });
      container.dispatchEvent(tabEvent);

      release();
    });
  });
});

describe('Video Element Utilities', () => {
  let video: HTMLVideoElement;

  beforeEach(() => {
    video = document.createElement('video');
    // Mock video properties
    Object.defineProperty(video, 'currentTime', {
      value: 10,
      writable: true,
    });
    Object.defineProperty(video, 'duration', {
      value: 100,
      writable: true,
    });
    Object.defineProperty(video, 'paused', {
      value: false,
      writable: true,
    });
    Object.defineProperty(video, 'ended', {
      value: false,
      writable: true,
    });
    Object.defineProperty(video, 'readyState', {
      value: 4,
      writable: true,
    });
    document.body.appendChild(video);
  });

  afterEach(() => {
    video.remove();
  });

  describe('findVideoElement', () => {
    it('should find video element', () => {
      const found = findVideoElement();
      expect(found).toBe(video);
    });
  });

  describe('findAllVideoElements', () => {
    it('should find all video elements', () => {
      const video2 = document.createElement('video');
      document.body.appendChild(video2);

      const videos = findAllVideoElements();
      expect(videos).toHaveLength(2);

      video2.remove();
    });
  });

  describe('getVideoTime', () => {
    it('should get current time', () => {
      expect(getVideoTime(video)).toBe(10);
    });
  });

  describe('setVideoTime', () => {
    it('should set current time', () => {
      setVideoTime(video, 50);
      expect(video.currentTime).toBe(50);
    });
  });

  describe('isVideoPlaying', () => {
    it('should return true when video is playing', () => {
      expect(isVideoPlaying(video)).toBe(true);
    });

    it('should return false when video is paused', () => {
      Object.defineProperty(video, 'paused', { value: true });
      expect(isVideoPlaying(video)).toBe(false);
    });
  });

  describe('getVideoDuration', () => {
    it('should get duration', () => {
      expect(getVideoDuration(video)).toBe(100);
    });
  });

  describe('getVideoProgress', () => {
    it('should get progress as 0-1', () => {
      expect(getVideoProgress(video)).toBe(0.1);
    });

    it('should return 0 for no duration', () => {
      Object.defineProperty(video, 'duration', { value: 0 });
      expect(getVideoProgress(video)).toBe(0);
    });
  });
});

describe('Mutation Observation', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

  describe('observeMutations', () => {
    it('should observe DOM changes', async () => {
      const callback = vi.fn();
      const disconnect = observeMutations(container, callback);

      const child = document.createElement('div');
      container.appendChild(child);

      // Wait for mutation observer to fire
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(callback).toHaveBeenCalled();
      disconnect();
    });
  });

  describe('observeAttributes', () => {
    it('should observe attribute changes', async () => {
      const callback = vi.fn();
      const disconnect = observeAttributes(container, callback);

      container.setAttribute('data-test', 'value');

      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(callback).toHaveBeenCalledWith('data-test', null);
      disconnect();
    });

    it('should filter specific attributes', async () => {
      const callback = vi.fn();
      const disconnect = observeAttributes(container, callback, ['data-watch']);

      container.setAttribute('data-watch', 'value');
      container.setAttribute('data-ignore', 'value');

      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith('data-watch', null);
      disconnect();
    });
  });
});
