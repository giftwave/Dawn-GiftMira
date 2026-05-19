if (!customElements.get('quantity-breaks')) {
  customElements.define(
    'quantity-breaks',
    class QuantityBreaks extends HTMLElement {
      connectedCallback() {
        this.variants     = JSON.parse(this.querySelector('[data-qb-variants]').textContent);
        this.options      = JSON.parse(this.querySelector('[data-qb-options]').textContent);
        this.tiers        = JSON.parse(this.dataset.tiers);
        this.basePrice    = parseInt(this.dataset.basePrice, 10);
        this.currency     = this.dataset.currency;

        this.slotsEl   = this.querySelector('.quantity-breaks__slots');
        this.footerEl  = this.querySelector('.quantity-breaks__footer');
        this.ctaBtn    = this.querySelector('.quantity-breaks__cta');
        this.ctaText   = this.querySelector('.qb-cta-text');
        this.ctaSavings = this.querySelector('.qb-cta-savings');
        this.errorEl   = this.querySelector('.quantity-breaks__error');

        this.defaultVariant = this._findDefaultVariant();

        // True only when product has multiple selectable option values
        this.hasChoices = this.options.some(opt => opt.values.length > 1);

        this.querySelector('.quantity-breaks__tiers').addEventListener('click', (e) => {
          const btn = e.target.closest('.quantity-breaks__tier-btn');
          if (!btn) return;
          this._selectTier(btn);
        });

        this.ctaBtn.addEventListener('click', () => this._addToCart());

        this._selectTier(this.querySelector('.quantity-breaks__tier-btn.is-active'));
      }

      _findDefaultVariant() {
        const input = document.querySelector('.product-variant-id');
        if (input) {
          const id = parseInt(input.value, 10);
          const found = this.variants.find(v => v.id === id);
          if (found) return found;
        }
        return this.variants.find(v => v.available) || this.variants[0];
      }

      _selectTier(btn) {
        this.querySelectorAll('.quantity-breaks__tier-btn').forEach(b => {
          b.classList.remove('is-active');
          b.setAttribute('aria-pressed', 'false');
        });
        btn.classList.add('is-active');
        btn.setAttribute('aria-pressed', 'true');

        this.currentQty  = parseInt(btn.dataset.qty, 10);
        this.currentDisc = parseInt(btn.dataset.disc, 10);

        this._renderSlots();
        this.footerEl.hidden = false;
        this._updateCta();
      }

      _renderSlots() {
        this.slotsEl.innerHTML = '';
        this.slotVariants = [];

        if (!this.hasChoices) {
          // No selectable options — pre-fill all slots silently
          for (let i = 0; i < this.currentQty; i++) {
            this.slotVariants[i] = this.defaultVariant;
          }
          return;
        }

        for (let i = 0; i < this.currentQty; i++) {
          const slot = document.createElement('div');
          slot.className = 'quantity-breaks__slot';

          const numLabel = document.createElement('span');
          numLabel.className = 'qb-slot-num';
          numLabel.textContent = `Item ${i + 1}`;
          slot.appendChild(numLabel);

          const optionsWrap = document.createElement('div');
          optionsWrap.className = 'qb-slot-options';

          this.options.forEach((opt, optIdx) => {
            if (opt.values.length <= 1) return; // skip single-value options

            const wrap = document.createElement('div');
            wrap.className = 'qb-option-wrap';

            const label = document.createElement('label');
            label.className = 'qb-option-label';
            label.textContent = opt.name;

            const select = document.createElement('select');
            select.className = 'qb-option-select';
            select.dataset.slotIndex   = i;
            select.dataset.optionIndex = optIdx;
            select.ariaLabel = `${opt.name} for item ${i + 1}`;

            opt.values.forEach(val => {
              const option = document.createElement('option');
              option.value = val;
              option.textContent = val;
              if (this.defaultVariant && this.defaultVariant[`option${optIdx + 1}`] === val) {
                option.selected = true;
              }
              select.appendChild(option);
            });

            select.addEventListener('change', () => this._onSlotChange(i));

            wrap.appendChild(label);
            wrap.appendChild(select);
            optionsWrap.appendChild(wrap);
          });

          slot.appendChild(optionsWrap);
          this.slotsEl.appendChild(slot);

          this.slotVariants[i] = this._resolveSlotVariant(i);
          this._renderSlotAvailability(i);
        }
      }

      _onSlotChange(slotIndex) {
        this.slotVariants[slotIndex] = this._resolveSlotVariant(slotIndex);
        this._renderSlotAvailability(slotIndex);
        this._updateCta();
      }

      _resolveSlotVariant(slotIndex) {
        if (!this.hasChoices) return this.defaultVariant;

        const slotSelects = this.slotsEl.querySelectorAll(`[data-slot-index="${slotIndex}"]`);
        if (!slotSelects.length) return this.defaultVariant;

        const selectedValues = Array.from(slotSelects).map(s => s.value);
        return this.variants.find(v =>
          selectedValues.every((val, i) => v[`option${i + 1}`] === val)
        ) || null;
      }

      _renderSlotAvailability(slotIndex) {
        if (!this.hasChoices) return;

        const variant = this.slotVariants[slotIndex];
        const slots   = this.slotsEl.querySelectorAll('.quantity-breaks__slot');
        const slot    = slots[slotIndex];
        if (!slot) return;

        let msgEl = slot.querySelector('.qb-unavailable-msg');
        if (!msgEl) {
          msgEl = document.createElement('p');
          msgEl.className = 'qb-unavailable-msg';
          slot.appendChild(msgEl);
        }

        const unavailable = !variant || !variant.available;
        msgEl.hidden = !unavailable;
        if (unavailable) msgEl.textContent = 'This option is currently unavailable';
      }

      _updateCta() {
        const allOk = this.slotVariants.length === this.currentQty &&
          this.slotVariants.every(v => v && v.available);

        const totalSavings = Math.round(this.basePrice * this.currentDisc / 100) * this.currentQty;

        this.ctaBtn.disabled = !allOk;
        this.ctaText.textContent = `Add ${this.currentQty} to Cart`;
        this.ctaSavings.textContent = allOk ? `— Save ${this._formatMoney(totalSavings)}` : '';
      }

      _formatMoney(cents) {
        return (cents / 100).toLocaleString('en-US', {
          style: 'currency',
          currency: this.currency || 'USD',
          minimumFractionDigits: 2
        });
      }

      async _addToCart() {
        if (this.ctaBtn.disabled) return;

        this._setLoading(true);
        this._showError(false);

        const items = this.slotVariants.map(v => ({ id: v.id, quantity: 1 }));

        try {
          const res  = await fetch(`${window.Shopify.routes.root}cart/add.js`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ items })
          });
          const data = await res.json();

          if (data.status) {
            this._showError(true, data.description || 'Could not add items to cart.');
            return;
          }

          const cartDrawer = document.querySelector('cart-drawer');
          if (cartDrawer && typeof cartDrawer.renderContents === 'function') {
            cartDrawer.renderContents(data);
          }

          if (typeof publish === 'function' && typeof PUB_SUB_EVENTS !== 'undefined') {
            publish(PUB_SUB_EVENTS.cartUpdate, { source: 'quantity-breaks', cartData: data });
          }

        } catch (err) {
          this._showError(true, 'Something went wrong. Please try again.');
          console.error(err);
        } finally {
          this._setLoading(false);
        }
      }

      _setLoading(on) {
        this.ctaBtn.classList.toggle('loading', on);
        this.ctaBtn.setAttribute('aria-disabled', on ? 'true' : 'false');
        const spinner = this.ctaBtn.querySelector('.loading__spinner');
        if (spinner) spinner.classList.toggle('hidden', !on);
      }

      _showError(show, msg = '') {
        this.errorEl.hidden = !show;
        if (msg) this.errorEl.textContent = msg;
      }
    }
  );
}
