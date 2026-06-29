import { describe, it, expect } from "vitest";

import { queryPreview } from "@/components/workspace/query-preview";

describe("queryPreview SQL strategy", () => {
  // behavior (postgres fetch builds a schema-qualified SELECT with WHERE/ORDER/LIMIT/OFFSET)
  it("should build a schema-qualified SELECT for postgres", () => {
    const preview = queryPreview("postgres", "analytics");
    expect(
      preview.fetch("users", "age > 30", { column: "age", descending: true }, 200, 200),
    ).toBe(
      'SELECT * FROM "analytics"."users" WHERE (age > 30) ORDER BY "age" DESC LIMIT 200 OFFSET 200',
    );
  });

  // behavior (the SQL filter rejects a semicolon - a second-statement attempt)
  it("should reject a SQL filter containing a semicolon", () => {
    const preview = queryPreview("postgres", null);
    expect(preview.validateFilter("a = 1; DROP TABLE x")).toMatch(/semicolon/i);
    expect(preview.validateFilter("a = 1")).toBeNull();
  });
});

describe("queryPreview MongoDB strategy (TC-013)", () => {
  const preview = queryPreview("mongodb", null);

  // TC-013 - behavior (fetch reads as a db.coll.find(...).limit(...) string, not SQL)
  it("should build a db.collection.find preview string for a mongo collection", () => {
    expect(
      preview.fetch("orders", '{ "status": "paid" }', { column: "total", descending: false }, 200, 0),
    ).toBe('db.orders.find({ "status": "paid" }).sort({ total: 1 }).limit(200)');
  });

  // TC-013 - behavior (an empty filter previews as find({}))
  it("should preview an empty filter as find({})", () => {
    expect(preview.fetch("orders", undefined, null, 200, 0)).toBe(
      "db.orders.find({}).limit(200)",
    );
  });

  // TC-013, AC-011 - behavior (a cell update reads as updateOne with $set, value as JSON literal)
  it("should build an updateOne $set preview with the value as a JSON literal", () => {
    expect(preview.update("orders", "total", "120", "_id", "65f")).toBe(
      "db.orders.updateOne({ _id: \"65f\" }, { $set: { total: 120 } })",
    );
  });

  // AC-012 - behavior (insert reads as insertOne; delete as deleteOne keyed on _id)
  it("should build insertOne and deleteOne previews", () => {
    expect(preview.insert("orders", { status: "paid", total: "99" })).toBe(
      'db.orders.insertOne({ status: "paid", total: 99 })',
    );
    expect(preview.remove("orders", "_id", "65f")).toBe(
      'db.orders.deleteOne({ _id: "65f" })',
    );
  });

  // AC-008 - behavior (the mongo filter accepts valid JSON objects, rejects bad JSON / non-objects)
  it("should validate the mongo filter as a JSON object", () => {
    expect(preview.validateFilter("")).toBeNull();
    expect(preview.validateFilter('{ "age": { "$gt": 30 } }')).toBeNull();
    expect(preview.validateFilter("{ not json")).toMatch(/valid json/i);
    expect(preview.validateFilter("[1,2,3]")).toMatch(/json object/i);
  });
});
