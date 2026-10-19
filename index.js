// Pabili PH entry — polyfills must run BEFORE any other module is imported.
import 'react-native-get-random-values';
import 'react-native-url-polyfill/auto';
import { Buffer } from 'buffer';
global.Buffer = global.Buffer || Buffer;
import { registerRootComponent } from 'expo';
import App from './App';
registerRootComponent(App);
