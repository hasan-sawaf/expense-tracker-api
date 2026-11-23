export const errorHandler = (err, req, res, next) => {
    // 1. Zod Validation Error
    if (err.name === 'ZodError') {
        const errors = err.issues.map((issue) => ({
            field: issue.path.join('.'),
            message: issue.message,
        }));

        return res.status(400).json({
            status: 'fail',
            message: 'Validation failed',
            errors,
        });
    }

    // 2. Mongoose Invalid ObjectId (e.g. /api/v1/expenses/123)
    if (err.name === 'CastError') {
        return res.status(400).json({
            status: 'fail',
            message: `Invalid ${err.path}: ${err.value}`,
        });
    }

    // 3. Mongoose Validation Error
    if (err.name === 'ValidationError') {
        const errors = Object.values(err.errors).map((el) => ({
            field: el.path,
            message: el.message,
        }));

        return res.status(400).json({
            status: 'fail',
            message: 'Validation failed',
            errors,
        });
    }

    // 4. Malformed JSON Body
    if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
        return res.status(400).json({
            status: 'fail',
            message: 'Invalid JSON payload',
        });
    }

    // 5. Operational Errors (custom AppError)
    if (err.isOperational) {
        return res.status(err.statusCode).json({
            status: err.status,
            message: err.message,
        });
    }

    // 6. Unexpected / Programming Errors
    console.error('UNEXPECTED ERROR:', err);
    return res.status(500).json({
        status: 'error',
        message: 'Something went wrong on the server',
    });
};
