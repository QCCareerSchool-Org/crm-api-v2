/* tslint:disable:ordered-imports */
import * as express from 'express';

export const router: express.Router = express.Router();
export const routerSecure: express.Router = express.Router();

import { get as getCountries, options as optionsCountries } from './countries';
import { get as getCountry, options as optionsCountry } from './country';
import { get as getProvinces, getAll as getAllProvinces, options as optionsProvinces } from './provinces';

router.options('/countries', optionsCountries);
router.options('/countries/:cId', optionsCountry);
router.options('/countries/:cId/provinces', optionsProvinces);

routerSecure.get('/countries', getCountries);
routerSecure.get('/countries/:cId', getCountry);
routerSecure.get('/countries/:cId/provinces', getProvinces);
routerSecure.get('/provinces', getAllProvinces);
