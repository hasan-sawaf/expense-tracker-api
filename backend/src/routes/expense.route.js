import { Router } from 'express';
import {
    createExpense,
    getExpenses,
    getExpenseById,
    updateExpense,
    deleteExpense,
    getMonthlySummary,
    addIncomeConversion,
    deleteIncomeConversion,
} from '../controllers/expense.controller.js';
import { validate } from '../middlewares/validate.middleware.js';
import {
    conversionSchema,
    createExpenseSchema,
    updateExpenseSchema,
} from '../validators/expense.validator.js';

const router = Router();

router
    .route('/')
    .post(validate(createExpenseSchema), createExpense)
    .get(getExpenses);

// Must be registered before /:id so "summary" is not treated as an :id param
router.get('/summary', getMonthlySummary);

router.post('/:id/convert', validate(conversionSchema), addIncomeConversion);
router.delete('/:id/conversions/:conversionId', deleteIncomeConversion);

router
    .route('/:id')
    .get(getExpenseById)
    .patch(validate(updateExpenseSchema), updateExpense)
    .delete(deleteExpense);

export default router;
