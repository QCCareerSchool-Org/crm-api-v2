/* tslint:disable:ordered-imports */
import * as express from 'express';

export const router: express.Router = express.Router();
export const routerSecure: express.Router = express.Router();

import { studentAccess } from '../authentication';

import { get as getStudent, patch as patchStudent, options as optionsStudent } from './student';
import { getAddress, updateAddress, addressOptions as optionsAddress } from './student';
import { getEmailAddress, updateEmailAddress, emailAddressOptions as optionsEmail } from './student';
import { getTelephoneNumber, updateTelephoneNumber, telephoneNuberOptions as optionsTel } from './student';

import { get as getEnrollments, options as optionEnrollments } from './enrollments';

import { get as getEnrollment, options as optionEnrollment } from './enrollment';

import { get as getTransactions, options as optionsTransactions } from './transactions';

import { get as getPaymentMethods, create as createPaymentMethod, options as optionsPaymentMethods } from './payment-methods';

import { get as getPaymentMethod, options as optionsPaymentMethod } from './payment-method';
import { charge as chargePaymentMethod, chargeOptions as optionsCharge } from './payment-method';
import { setPrimary as setPrimaryPaymentMethod, setPrimaryOptions as optionsSetPrimary } from './payment-method';

router.options('/students/:sId', optionsStudent);
router.options('/students/:sId/address', optionsAddress);
router.options('/students/:sId/emailAddress', optionsEmail);
router.options('/students/:sId/telephoneNumber', optionsTel);

router.options('/students/:sId/enrollments', optionEnrollments);

router.options('/students/:sId/enrollments/:eId', optionEnrollment);

router.options('/students/:sId/enrollments/:eId/transactions', optionsTransactions);

router.options('/students/:sId/enrollments/:eId/paymentMethods', optionsPaymentMethods);

router.options('/students/:sId/enrollments/:eId/paymentMethods/:pId', optionsPaymentMethod);
router.options('/students/:sId/enrollments/:eId/paymentMethods/:pId/charge', optionsCharge);
router.options('/students/:sId/enrollments/:eId/paymentMethods/:pId/setPrimary', optionsSetPrimary);

routerSecure.use('/students/:sId', studentAccess);

routerSecure.get('/students/:sId', getStudent);
routerSecure.patch('/students/:sId', patchStudent);
routerSecure.get('/students/:sId/address', getAddress);
routerSecure.put('/students/:sId/address', updateAddress);
routerSecure.get('/students/:sId/emailAddress', getEmailAddress);
routerSecure.put('/students/:sId/emailAddress', updateEmailAddress);
routerSecure.get('/students/:sId/telephoneNumber', getTelephoneNumber);
routerSecure.put('/students/:sId/telephoneNumber', updateTelephoneNumber);

routerSecure.get('/students/:sId/enrollments', getEnrollments);

routerSecure.get('/students/:sId/enrollments/:eId', getEnrollment);

routerSecure.get('/students/:sId/enrollments/:eId/transactions', getTransactions);

routerSecure.get('/students/:sId/enrollments/:eId/paymentMethods', getPaymentMethods);
routerSecure.post('/students/:sId/enrollments/:eId/paymentMethods', createPaymentMethod);

routerSecure.get('/students/:sId/enrollments/:eId/paymentMethods/:pId', getPaymentMethod);
routerSecure.post('/students/:sId/enrollments/:eId/paymentMethods/:pId/charge', chargePaymentMethod);
routerSecure.post('/students/:sId/enrollments/:eId/paymentMethods/:pId/setPrimary', setPrimaryPaymentMethod);
