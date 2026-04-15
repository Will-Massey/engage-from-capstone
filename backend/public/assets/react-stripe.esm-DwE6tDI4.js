import { R as a } from './vendor-gsVlWEBE.js';
import { P as f } from './index-BWcKo7bb.js';
function X(r, e) {
  var t = Object.keys(r);
  if (Object.getOwnPropertySymbols) {
    var n = Object.getOwnPropertySymbols(r);
    (e &&
      (n = n.filter(function (u) {
        return Object.getOwnPropertyDescriptor(r, u).enumerable;
      })),
      t.push.apply(t, n));
  }
  return t;
}
function Z(r) {
  for (var e = 1; e < arguments.length; e++) {
    var t = arguments[e] != null ? arguments[e] : {};
    e % 2
      ? X(Object(t), !0).forEach(function (n) {
          ae(r, n, t[n]);
        })
      : Object.getOwnPropertyDescriptors
        ? Object.defineProperties(r, Object.getOwnPropertyDescriptors(t))
        : X(Object(t)).forEach(function (n) {
            Object.defineProperty(r, n, Object.getOwnPropertyDescriptor(t, n));
          });
  }
  return r;
}
function W(r) {
  '@babel/helpers - typeof';
  return (
    typeof Symbol == 'function' && typeof Symbol.iterator == 'symbol'
      ? (W = function (e) {
          return typeof e;
        })
      : (W = function (e) {
          return e &&
            typeof Symbol == 'function' &&
            e.constructor === Symbol &&
            e !== Symbol.prototype
            ? 'symbol'
            : typeof e;
        }),
    W(r)
  );
}
function ee(r, e, t, n, u, o, s) {
  try {
    var c = r[o](s),
      i = c.value;
  } catch (m) {
    t(m);
    return;
  }
  c.done ? e(i) : Promise.resolve(i).then(n, u);
}
function oe(r) {
  return function () {
    var e = this,
      t = arguments;
    return new Promise(function (n, u) {
      var o = r.apply(e, t);
      function s(i) {
        ee(o, n, u, s, c, 'next', i);
      }
      function c(i) {
        ee(o, n, u, s, c, 'throw', i);
      }
      s(void 0);
    });
  };
}
function ae(r, e, t) {
  return (
    e in r
      ? Object.defineProperty(r, e, { value: t, enumerable: !0, configurable: !0, writable: !0 })
      : (r[e] = t),
    r
  );
}
function ge(r, e) {
  if (r == null) return {};
  var t = {},
    n = Object.keys(r),
    u,
    o;
  for (o = 0; o < n.length; o++) ((u = n[o]), !(e.indexOf(u) >= 0) && (t[u] = r[u]));
  return t;
}
function ye(r, e) {
  if (r == null) return {};
  var t = ge(r, e),
    n,
    u;
  if (Object.getOwnPropertySymbols) {
    var o = Object.getOwnPropertySymbols(r);
    for (u = 0; u < o.length; u++)
      ((n = o[u]),
        !(e.indexOf(n) >= 0) && Object.prototype.propertyIsEnumerable.call(r, n) && (t[n] = r[n]));
  }
  return t;
}
function T(r, e) {
  return Ce(r) || Ee(r, e) || be(r, e) || Se();
}
function Ce(r) {
  if (Array.isArray(r)) return r;
}
function Ee(r, e) {
  var t = r && ((typeof Symbol < 'u' && r[Symbol.iterator]) || r['@@iterator']);
  if (t != null) {
    var n = [],
      u = !0,
      o = !1,
      s,
      c;
    try {
      for (
        t = t.call(r);
        !(u = (s = t.next()).done) && (n.push(s.value), !(e && n.length === e));
        u = !0
      );
    } catch (i) {
      ((o = !0), (c = i));
    } finally {
      try {
        !u && t.return != null && t.return();
      } finally {
        if (o) throw c;
      }
    }
    return n;
  }
}
function be(r, e) {
  if (r) {
    if (typeof r == 'string') return te(r, e);
    var t = Object.prototype.toString.call(r).slice(8, -1);
    if ((t === 'Object' && r.constructor && (t = r.constructor.name), t === 'Map' || t === 'Set'))
      return Array.from(r);
    if (t === 'Arguments' || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(t)) return te(r, e);
  }
}
function te(r, e) {
  (e == null || e > r.length) && (e = r.length);
  for (var t = 0, n = new Array(e); t < e; t++) n[t] = r[t];
  return n;
}
function Se() {
  throw new TypeError(`Invalid attempt to destructure non-iterable instance.
In order to be iterable, non-array objects must have a [Symbol.iterator]() method.`);
}
var b = function (e, t, n) {
    var u = !!n,
      o = a.useRef(n);
    (a.useEffect(
      function () {
        o.current = n;
      },
      [n]
    ),
      a.useEffect(
        function () {
          if (!u || !e) return function () {};
          var s = function () {
            o.current && o.current.apply(o, arguments);
          };
          return (
            e.on(t, s),
            function () {
              e.off(t, s);
            }
          );
        },
        [u, t, e, o]
      ));
  },
  M = function (e) {
    var t = a.useRef(e);
    return (
      a.useEffect(
        function () {
          t.current = e;
        },
        [e]
      ),
      t.current
    );
  },
  D = function (e) {
    return e !== null && W(e) === 'object';
  },
  ke = function (e) {
    return D(e) && typeof e.then == 'function';
  },
  Pe = function (e) {
    return (
      D(e) &&
      typeof e.elements == 'function' &&
      typeof e.createToken == 'function' &&
      typeof e.createPaymentMethod == 'function' &&
      typeof e.confirmCardPayment == 'function'
    );
  },
  ne = '[object Object]',
  Re = function r(e, t) {
    if (!D(e) || !D(t)) return e === t;
    var n = Array.isArray(e),
      u = Array.isArray(t);
    if (n !== u) return !1;
    var o = Object.prototype.toString.call(e) === ne,
      s = Object.prototype.toString.call(t) === ne;
    if (o !== s) return !1;
    if (!o && !n) return e === t;
    var c = Object.keys(e),
      i = Object.keys(t);
    if (c.length !== i.length) return !1;
    for (var m = {}, d = 0; d < c.length; d += 1) m[c[d]] = !0;
    for (var C = 0; C < i.length; C += 1) m[i[C]] = !0;
    var l = Object.keys(m);
    if (l.length !== c.length) return !1;
    var p = e,
      h = t,
      v = function (k) {
        return r(p[k], h[k]);
      };
    return l.every(v);
  },
  ie = function (e, t, n) {
    return D(e)
      ? Object.keys(e).reduce(function (u, o) {
          var s = !D(t) || !Re(e[o], t[o]);
          return n.includes(o)
            ? (s &&
                console.warn(
                  'Unsupported prop change: options.'.concat(o, ' is not a mutable property.')
                ),
              u)
            : s
              ? Z(Z({}, u || {}), {}, ae({}, o, e[o]))
              : u;
        }, null)
      : null;
  },
  ue =
    'Invalid prop `stripe` supplied to `Elements`. We recommend using the `loadStripe` utility from `@stripe/stripe-js`. See https://stripe.com/docs/stripe-js/react#elements-props-stripe for details.',
  re = function (e) {
    var t = arguments.length > 1 && arguments[1] !== void 0 ? arguments[1] : ue;
    if (e === null || Pe(e)) return e;
    throw new Error(t);
  },
  _ = function (e) {
    var t = arguments.length > 1 && arguments[1] !== void 0 ? arguments[1] : ue;
    if (ke(e))
      return {
        tag: 'async',
        stripePromise: Promise.resolve(e).then(function (u) {
          return re(u, t);
        }),
      };
    var n = re(e, t);
    return n === null ? { tag: 'empty' } : { tag: 'sync', stripe: n };
  },
  B = function (e) {
    !e ||
      !e._registerWrapper ||
      !e.registerAppInfo ||
      (e._registerWrapper({ name: 'react-stripe-js', version: '5.6.1' }),
      e.registerAppInfo({
        name: 'react-stripe-js',
        version: '5.6.1',
        url: 'https://stripe.com/docs/stripe-js/react',
      }));
  },
  F = a.createContext(null);
F.displayName = 'ElementsContext';
var se = function (e, t) {
    if (!e)
      throw new Error(
        'Could not find Elements context; You need to wrap the part of your app that '.concat(
          t,
          ' in an <Elements> provider.'
        )
      );
    return e;
  },
  Oe = function (e) {
    var t = e.stripe,
      n = e.options,
      u = e.children,
      o = a.useMemo(
        function () {
          return _(t);
        },
        [t]
      ),
      s = a.useState(function () {
        return {
          stripe: o.tag === 'sync' ? o.stripe : null,
          elements: o.tag === 'sync' ? o.stripe.elements(n) : null,
        };
      }),
      c = T(s, 2),
      i = c[0],
      m = c[1];
    a.useEffect(
      function () {
        var l = !0,
          p = function (v) {
            m(function (g) {
              return g.stripe ? g : { stripe: v, elements: v.elements(n) };
            });
          };
        return (
          o.tag === 'async' && !i.stripe
            ? o.stripePromise.then(function (h) {
                h && l && p(h);
              })
            : o.tag === 'sync' && !i.stripe && p(o.stripe),
          function () {
            l = !1;
          }
        );
      },
      [o, i, n]
    );
    var d = M(t);
    a.useEffect(
      function () {
        d !== null &&
          d !== t &&
          console.warn(
            'Unsupported prop change on Elements: You cannot change the `stripe` prop after setting it.'
          );
      },
      [d, t]
    );
    var C = M(n);
    return (
      a.useEffect(
        function () {
          if (i.elements) {
            var l = ie(n, C, ['clientSecret', 'fonts']);
            l && i.elements.update(l);
          }
        },
        [n, C, i.elements]
      ),
      a.useEffect(
        function () {
          B(i.stripe);
        },
        [i.stripe]
      ),
      a.createElement(F.Provider, { value: i }, u)
    );
  };
Oe.propTypes = { stripe: f.any, options: f.object };
var ce = function (e) {
    var t = a.useContext(F);
    return se(t, e);
  },
  Ue = function () {
    var e = ce('calls useElements()'),
      t = e.elements;
    return t;
  },
  we = function (e) {
    var t = e.children,
      n = ce('mounts <ElementsConsumer>');
    return t(n);
  };
we.propTypes = { children: f.func.isRequired };
var le = a.createContext(null);
le.displayName = 'CheckoutContext';
(f.any,
  f.shape({
    clientSecret: f.oneOfType([f.string, f.instanceOf(Promise)]).isRequired,
    elementsOptions: f.object,
  }).isRequired);
var H = function (e) {
    var t = a.useContext(le),
      n = a.useContext(F);
    if (t) {
      if (n)
        throw new Error(
          'You cannot wrap the part of your app that '.concat(
            e,
            ' in both <CheckoutProvider> and <Elements> providers.'
          )
        );
      return t;
    } else return se(n, e);
  },
  Ae = ['mode'],
  xe = function (e) {
    return e.charAt(0).toUpperCase() + e.slice(1);
  },
  P = function (e, t) {
    var n = ''.concat(xe(e), 'Element'),
      u = function (i) {
        var m = i.id,
          d = i.className,
          C = i.options,
          l = C === void 0 ? {} : C,
          p = i.onBlur,
          h = i.onFocus,
          v = i.onReady,
          g = i.onChange,
          k = i.onEscape,
          N = i.onClick,
          w = i.onLoadError,
          A = i.onLoaderStart,
          x = i.onNetworksChange,
          U = i.onConfirm,
          R = i.onCancel,
          I = i.onShippingAddressChange,
          pe = i.onShippingRateChange,
          fe = i.onSavedPaymentMethodRemove,
          me = i.onSavedPaymentMethodUpdate,
          $ = H('mounts <'.concat(n, '>')),
          Y = 'elements' in $ ? $.elements : null,
          L = 'checkoutState' in $ ? $.checkoutState : null,
          O =
            (L == null ? void 0 : L.type) === 'success' ||
            (L == null ? void 0 : L.type) === 'loading'
              ? L.sdk
              : null,
          ve = a.useState(null),
          z = T(ve, 2),
          E = z[0],
          he = z[1],
          j = a.useRef(null),
          q = a.useRef(null);
        (b(E, 'blur', p),
          b(E, 'focus', h),
          b(E, 'escape', k),
          b(E, 'click', N),
          b(E, 'loaderror', w),
          b(E, 'loaderstart', A),
          b(E, 'networkschange', x),
          b(E, 'confirm', U),
          b(E, 'cancel', R),
          b(E, 'shippingaddresschange', I),
          b(E, 'shippingratechange', pe),
          b(E, 'savedpaymentmethodremove', fe),
          b(E, 'savedpaymentmethodupdate', me),
          b(E, 'change', g));
        var K;
        (v &&
          (e === 'expressCheckout'
            ? (K = v)
            : (K = function () {
                v(E);
              })),
          b(E, 'ready', K),
          a.useLayoutEffect(
            function () {
              if (j.current === null && q.current !== null && (Y || O)) {
                var y = null;
                if (O)
                  switch (e) {
                    case 'paymentForm':
                      y = O.createPaymentFormElement(l);
                      break;
                    case 'payment':
                      y = O.createPaymentElement(l);
                      break;
                    case 'address':
                      if ('mode' in l) {
                        var V = l.mode,
                          Q = ye(l, Ae);
                        if (V === 'shipping') y = O.createShippingAddressElement(Q);
                        else if (V === 'billing') y = O.createBillingAddressElement(Q);
                        else
                          throw new Error(
                            "Invalid options.mode. mode must be 'billing' or 'shipping'."
                          );
                      } else
                        throw new Error(
                          "You must supply options.mode. mode must be 'billing' or 'shipping'."
                        );
                      break;
                    case 'expressCheckout':
                      y = O.createExpressCheckoutElement(l);
                      break;
                    case 'currencySelector':
                      y = O.createCurrencySelectorElement();
                      break;
                    case 'taxId':
                      y = O.createTaxIdElement(l);
                      break;
                    default:
                      throw new Error(
                        'Invalid Element type '.concat(
                          n,
                          ". You must use either the <PaymentElement />, <AddressElement options={{mode: 'shipping'}} />, <AddressElement options={{mode: 'billing'}} />, or <ExpressCheckoutElement />."
                        )
                      );
                  }
                else Y && (y = Y.create(e, l));
                ((j.current = y), he(y), y && y.mount(q.current));
              }
            },
            [Y, O, l]
          ));
        var G = M(l);
        return (
          a.useEffect(
            function () {
              if (j.current) {
                var y = ie(l, G, ['paymentRequest']);
                y && 'update' in j.current && j.current.update(y);
              }
            },
            [l, G]
          ),
          a.useLayoutEffect(function () {
            return function () {
              if (j.current && typeof j.current.destroy == 'function')
                try {
                  (j.current.destroy(), (j.current = null));
                } catch {}
            };
          }, []),
          a.createElement('div', { id: m, className: d, ref: q })
        );
      },
      o = function (i) {
        H('mounts <'.concat(n, '>'));
        var m = i.id,
          d = i.className;
        return a.createElement('div', { id: m, className: d });
      },
      s = t ? o : u;
    return (
      (s.propTypes = {
        id: f.string,
        className: f.string,
        onChange: f.func,
        onBlur: f.func,
        onFocus: f.func,
        onReady: f.func,
        onEscape: f.func,
        onClick: f.func,
        onLoadError: f.func,
        onLoaderStart: f.func,
        onNetworksChange: f.func,
        onConfirm: f.func,
        onCancel: f.func,
        onShippingAddressChange: f.func,
        onShippingRateChange: f.func,
        onSavedPaymentMethodRemove: f.func,
        onSavedPaymentMethodUpdate: f.func,
        options: f.object,
      }),
      (s.displayName = n),
      (s.__elementType = e),
      s
    );
  },
  S = typeof window > 'u',
  J = a.createContext(null);
J.displayName = 'EmbeddedCheckoutProviderContext';
var de = function () {
    var e = a.useContext(J);
    if (!e) throw new Error('<EmbeddedCheckout> must be used within <EmbeddedCheckoutProvider>');
    return e;
  },
  Ie =
    'Invalid prop `stripe` supplied to `EmbeddedCheckoutProvider`. We recommend using the `loadStripe` utility from `@stripe/stripe-js`. See https://stripe.com/docs/stripe-js/react#elements-props-stripe for details.',
  De = function (e) {
    var t = e.stripe,
      n = e.options,
      u = e.children,
      o = a.useMemo(
        function () {
          return _(t, Ie);
        },
        [t]
      ),
      s = a.useRef(null),
      c = a.useRef(null),
      i = a.useState({ embeddedCheckout: null }),
      m = T(i, 2),
      d = m[0],
      C = m[1];
    (a.useEffect(
      function () {
        if (!(c.current || s.current)) {
          var h = function (g) {
            c.current ||
              s.current ||
              ((c.current = g),
              (s.current = c.current.initEmbeddedCheckout(n).then(function (k) {
                C({ embeddedCheckout: k });
              })));
          };
          o.tag === 'async' && !c.current && (n.clientSecret || n.fetchClientSecret)
            ? o.stripePromise.then(function (v) {
                v && h(v);
              })
            : o.tag === 'sync' &&
              !c.current &&
              (n.clientSecret || n.fetchClientSecret) &&
              h(o.stripe);
        }
      },
      [o, n, d, c]
    ),
      a.useEffect(
        function () {
          return function () {
            d.embeddedCheckout
              ? ((s.current = null), d.embeddedCheckout.destroy())
              : s.current &&
                s.current.then(function () {
                  ((s.current = null), d.embeddedCheckout && d.embeddedCheckout.destroy());
                });
          };
        },
        [d.embeddedCheckout]
      ),
      a.useEffect(
        function () {
          B(c);
        },
        [c]
      ));
    var l = M(t);
    a.useEffect(
      function () {
        l !== null &&
          l !== t &&
          console.warn(
            'Unsupported prop change on EmbeddedCheckoutProvider: You cannot change the `stripe` prop after setting it.'
          );
      },
      [l, t]
    );
    var p = M(n);
    return (
      a.useEffect(
        function () {
          if (p != null) {
            if (n == null) {
              console.warn(
                'Unsupported prop change on EmbeddedCheckoutProvider: You cannot unset options after setting them.'
              );
              return;
            }
            (n.clientSecret === void 0 &&
              n.fetchClientSecret === void 0 &&
              console.warn(
                'Invalid props passed to EmbeddedCheckoutProvider: You must provide one of either `options.fetchClientSecret` or `options.clientSecret`.'
              ),
              p.clientSecret != null &&
                n.clientSecret !== p.clientSecret &&
                console.warn(
                  'Unsupported prop change on EmbeddedCheckoutProvider: You cannot change the client secret after setting it. Unmount and create a new instance of EmbeddedCheckoutProvider instead.'
                ),
              p.fetchClientSecret != null &&
                n.fetchClientSecret !== p.fetchClientSecret &&
                console.warn(
                  'Unsupported prop change on EmbeddedCheckoutProvider: You cannot change fetchClientSecret after setting it. Unmount and create a new instance of EmbeddedCheckoutProvider instead.'
                ),
              p.onComplete != null &&
                n.onComplete !== p.onComplete &&
                console.warn(
                  'Unsupported prop change on EmbeddedCheckoutProvider: You cannot change the onComplete option after setting it.'
                ),
              p.onShippingDetailsChange != null &&
                n.onShippingDetailsChange !== p.onShippingDetailsChange &&
                console.warn(
                  'Unsupported prop change on EmbeddedCheckoutProvider: You cannot change the onShippingDetailsChange option after setting it.'
                ),
              p.onLineItemsChange != null &&
                n.onLineItemsChange !== p.onLineItemsChange &&
                console.warn(
                  'Unsupported prop change on EmbeddedCheckoutProvider: You cannot change the onLineItemsChange option after setting it.'
                ));
          }
        },
        [p, n]
      ),
      a.createElement(J.Provider, { value: d }, u)
    );
  },
  je = function (e) {
    var t = e.id,
      n = e.className,
      u = de(),
      o = u.embeddedCheckout,
      s = a.useRef(!1),
      c = a.useRef(null);
    return (
      a.useLayoutEffect(
        function () {
          return (
            !s.current && o && c.current !== null && (o.mount(c.current), (s.current = !0)),
            function () {
              if (s.current && o)
                try {
                  (o.unmount(), (s.current = !1));
                } catch {}
            }
          );
        },
        [o]
      ),
      a.createElement('div', { ref: c, id: t, className: n })
    );
  },
  Ne = function (e) {
    var t = e.id,
      n = e.className;
    return (de(), a.createElement('div', { id: t, className: n }));
  },
  Te = S ? Ne : je,
  $e = function (e) {
    var t = e.stripe,
      n = e.onLoad,
      u = e.onError,
      o = e.options,
      s = o == null ? void 0 : o.businessName,
      c = o == null ? void 0 : o.learnMoreLink,
      i = a.useRef(null),
      m = a.useMemo(
        function () {
          return _(t);
        },
        [t]
      ),
      d = a.useState(m.tag === 'sync' ? m.stripe : null),
      C = T(d, 2),
      l = C[0],
      p = C[1];
    a.useEffect(
      function () {
        var v = !0;
        return (
          m.tag === 'async'
            ? m.stripePromise.then(function (g) {
                g && v && p(g);
              })
            : m.tag === 'sync' && p(m.stripe),
          function () {
            v = !1;
          }
        );
      },
      [m]
    );
    var h = M(t);
    return (
      a.useEffect(
        function () {
          h !== null &&
            h !== t &&
            console.warn(
              'Unsupported prop change on FinancialAccountDisclosure: You cannot change the `stripe` prop after setting it.'
            );
        },
        [h, t]
      ),
      a.useEffect(
        function () {
          B(l);
        },
        [l]
      ),
      a.useEffect(
        function () {
          var v = (function () {
            var g = oe(
              regeneratorRuntime.mark(function k() {
                var N, w, A, x;
                return regeneratorRuntime.wrap(function (R) {
                  for (;;)
                    switch ((R.prev = R.next)) {
                      case 0:
                        if (!(!l || !i.current)) {
                          R.next = 2;
                          break;
                        }
                        return R.abrupt('return');
                      case 2:
                        return (
                          (R.next = 4),
                          l.createFinancialAccountDisclosure({ businessName: s, learnMoreLink: c })
                        );
                      case 4:
                        ((N = R.sent),
                          (w = N.htmlElement),
                          (A = N.error),
                          A && u
                            ? u(A)
                            : w &&
                              ((x = i.current), (x.innerHTML = ''), x.appendChild(w), n && n()));
                      case 8:
                      case 'end':
                        return R.stop();
                    }
                }, k);
              })
            );
            return function () {
              return g.apply(this, arguments);
            };
          })();
          v();
        },
        [l, s, c, n, u]
      ),
      a.createElement('div', { ref: i })
    );
  },
  Ye = function (e) {
    var t = e.stripe,
      n = e.onLoad,
      u = e.onError,
      o = e.options,
      s = o == null ? void 0 : o.issuingProgramID,
      c = o == null ? void 0 : o.publicCardProgramName,
      i = o == null ? void 0 : o.learnMoreLink,
      m = a.useRef(null),
      d = a.useMemo(
        function () {
          return _(t);
        },
        [t]
      ),
      C = a.useState(d.tag === 'sync' ? d.stripe : null),
      l = T(C, 2),
      p = l[0],
      h = l[1];
    a.useEffect(
      function () {
        var g = !0;
        return (
          d.tag === 'async'
            ? d.stripePromise.then(function (k) {
                k && g && h(k);
              })
            : d.tag === 'sync' && h(d.stripe),
          function () {
            g = !1;
          }
        );
      },
      [d]
    );
    var v = M(t);
    return (
      a.useEffect(
        function () {
          v !== null &&
            v !== t &&
            console.warn(
              'Unsupported prop change on IssuingDisclosure: You cannot change the `stripe` prop after setting it.'
            );
        },
        [v, t]
      ),
      a.useEffect(
        function () {
          B(p);
        },
        [p]
      ),
      a.useEffect(
        function () {
          var g = (function () {
            var k = oe(
              regeneratorRuntime.mark(function N() {
                var w, A, x, U;
                return regeneratorRuntime.wrap(function (I) {
                  for (;;)
                    switch ((I.prev = I.next)) {
                      case 0:
                        if (!(!p || !m.current)) {
                          I.next = 2;
                          break;
                        }
                        return I.abrupt('return');
                      case 2:
                        return (
                          (I.next = 4),
                          p.createIssuingDisclosure({
                            issuingProgramID: s,
                            publicCardProgramName: c,
                            learnMoreLink: i,
                          })
                        );
                      case 4:
                        ((w = I.sent),
                          (A = w.htmlElement),
                          (x = w.error),
                          x && u
                            ? u(x)
                            : A &&
                              ((U = m.current), (U.innerHTML = ''), U.appendChild(A), n && n()));
                      case 8:
                      case 'end':
                        return I.stop();
                    }
                }, N);
              })
            );
            return function () {
              return k.apply(this, arguments);
            };
          })();
          g();
        },
        [p, s, c, i, n, u]
      ),
      a.createElement('div', { ref: m })
    );
  },
  We = function () {
    var e = H('calls useStripe()'),
      t = e.stripe;
    return t;
  },
  _e = P('auBankAccount', S),
  Be = P('card', S),
  Fe = P('cardNumber', S),
  qe = P('cardExpiry', S),
  Ke = P('cardCvc', S),
  He = P('iban', S),
  Je = P('payment', S),
  ze = P('expressCheckout', S),
  Ge = P('paymentRequestButton', S),
  Ve = P('linkAuthentication', S),
  Qe = P('address', S),
  Xe = P('shippingAddress', S),
  Ze = P('paymentMethodMessaging', S),
  et = P('taxId', S);
export {
  Qe as AddressElement,
  _e as AuBankAccountElement,
  Ke as CardCvcElement,
  Be as CardElement,
  qe as CardExpiryElement,
  Fe as CardNumberElement,
  Oe as Elements,
  we as ElementsConsumer,
  Te as EmbeddedCheckout,
  De as EmbeddedCheckoutProvider,
  ze as ExpressCheckoutElement,
  $e as FinancialAccountDisclosure,
  He as IbanElement,
  Ye as IssuingDisclosure,
  Ve as LinkAuthenticationElement,
  Je as PaymentElement,
  Ze as PaymentMethodMessagingElement,
  Ge as PaymentRequestButtonElement,
  Xe as ShippingAddressElement,
  et as TaxIdElement,
  Ue as useElements,
  We as useStripe,
};
//# sourceMappingURL=react-stripe.esm-DwE6tDI4.js.map
