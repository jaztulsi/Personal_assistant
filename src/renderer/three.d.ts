// Bridge @react-three/fiber's element types into React 19's React.JSX namespace.
// r3f 8.x only augments global JSX; React 19 + jsx-runtime resolves through React.JSX.

import type { ThreeElements } from '@react-three/fiber'

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements extends ThreeElements {}
  }
}
