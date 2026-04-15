import { j as e, z as r, a as x } from './index-VhP35Y5n.js';
import { r as b } from './vendor-gsVlWEBE.js';
import {
  useStripe as h,
  useElements as j,
  PaymentElement as g,
} from './react-stripe.esm-DyqMdNGO.js';
const C = ({ priceId: d, onSuccess: u, onCancel: f }) => {
  const t = h(),
    n = j(),
    [o, s] = b.useState(!1),
    p = async (y) => {
      if ((y.preventDefault(), !t || !n)) {
        r.error('Stripe not loaded');
        return;
      }
      s(!0);
      try {
        const { error: a } = await n.submit();
        if (a) {
          (r.error(a.message || 'Payment failed'), s(!1));
          return;
        }
        const { paymentMethod: l, error: i } = await t.createPaymentMethod({ elements: n });
        if (i || !l) {
          (r.error((i == null ? void 0 : i.message) || 'Failed to create payment method'), s(!1));
          return;
        }
        const c = await x.createSubscription({ priceId: d, paymentMethodId: l.id });
        if (c.success) {
          if (c.data.clientSecret) {
            const { error: m } = await t.confirmCardPayment(c.data.clientSecret);
            if (m) {
              (r.error(m.message || 'Payment confirmation failed'), s(!1));
              return;
            }
          }
          (r.success('Subscription created successfully!'), u());
        }
      } catch (a) {
        r.error(a.message || 'Failed to create subscription');
      } finally {
        s(!1);
      }
    };
  return e.jsxs('form', {
    onSubmit: p,
    className: 'space-y-6',
    children: [
      e.jsx('div', {
        className: 'bg-gray-50 p-4 rounded-lg border border-gray-200',
        children: e.jsx(g, {}),
      }),
      e.jsxs('div', {
        className: 'flex space-x-3',
        children: [
          e.jsx('button', {
            type: 'button',
            onClick: f,
            className: 'flex-1 btn-secondary',
            disabled: o,
            children: 'Cancel',
          }),
          e.jsx('button', {
            type: 'submit',
            className: 'flex-1 btn-primary',
            disabled: !t || o,
            children: o
              ? e.jsxs('span', {
                  className: 'flex items-center justify-center',
                  children: [
                    e.jsxs('svg', {
                      className: 'animate-spin h-5 w-5 mr-2',
                      viewBox: '0 0 24 24',
                      children: [
                        e.jsx('circle', {
                          className: 'opacity-25',
                          cx: '12',
                          cy: '12',
                          r: '10',
                          stroke: 'currentColor',
                          strokeWidth: '4',
                          fill: 'none',
                        }),
                        e.jsx('path', {
                          className: 'opacity-75',
                          fill: 'currentColor',
                          d: 'M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z',
                        }),
                      ],
                    }),
                    'Processing...',
                  ],
                })
              : 'Subscribe Now',
          }),
        ],
      }),
    ],
  });
};
export { C as default };
//# sourceMappingURL=StripePaymentForm-HtcVJKNP.js.map
