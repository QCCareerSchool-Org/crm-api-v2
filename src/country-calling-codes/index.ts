/* tslint:disable:ordered-imports */
import * as express from 'express';

export const router: express.Router = express.Router();
export const routerSecure: express.Router = express.Router();

import { get, options } from './country-calling-codes';

router.options('/countryCallingCodes', options);

routerSecure.get('/countryCallingCodes', get);
