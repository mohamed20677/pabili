// مهم جداً: السطر ين الجايين قبل أي import تاني
import 'react-native-url-polyfill/auto';
import { Buffer } from 'buffer';
global.Buffer = global.Buffer || Buffer;

import { registerRootComponent } from 'expo';
import App from './App';

registerRootComponent(App);
