-- Read-only checks. Each query should return 0 rows.
SELECT email, COUNT(*) n FROM users GROUP BY email HAVING COUNT(*) > 1;
SELECT phone, COUNT(*) n FROM users GROUP BY phone HAVING COUNT(*) > 1;
SELECT id FROM users WHERE email IS NULL OR email = '' OR name IS NULL OR name = '';
SELECT p.id FROM products p LEFT JOIN categories c ON c.id=p.category_id WHERE c.id IS NULL;
SELECT p.id FROM products p LEFT JOIN manufacturers m ON m.id=p.manufacturer_id WHERE m.id IS NULL;
SELECT o.id FROM orders o LEFT JOIN users u ON u.id=o.user_id WHERE u.id IS NULL;
SELECT i.id FROM order_items i LEFT JOIN orders o ON o.id=i.order_id WHERE o.id IS NULL;
SELECT b.id FROM bookings b LEFT JOIN users u ON u.id=b.user_id WHERE u.id IS NULL;
SELECT c.user_id,c.product_id FROM cart_items c LEFT JOIN users u ON u.id=c.user_id LEFT JOIN products p ON p.id=c.product_id WHERE u.id IS NULL OR p.id IS NULL;
SELECT o.id,o.total,COALESCE(SUM(i.unit_price*i.quantity),0) calculated FROM orders o LEFT JOIN order_items i ON i.order_id=o.id GROUP BY o.id,o.total HAVING ABS(o.total-calculated)>0.005;
