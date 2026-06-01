do $$
declare
  v_profile_id uuid;
  v_version_id uuid;
  v_version_number integer;
  v_profile_key text := 'transamerica_ffiul_ii_icc24_tpiu12ic_0224';
  v_published_at timestamptz := '2026-06-01 00:00:00+00'::timestamptz;
begin
  select id
  into v_profile_id
  from illustration_profiles
  where lower(carrier) = lower('Transamerica Life Insurance Company')
    and lower(product_name) = lower('Transamerica Financial Foundation IUL II')
    and product_type = 'iul'
  limit 1;

  if v_profile_id is null then
    insert into illustration_profiles (
      carrier,
      product_name,
      product_type,
      status,
      notes
    ) values (
      'Transamerica Life Insurance Company',
      'Transamerica Financial Foundation IUL II',
      'iul',
      'active',
      'Codex-trained published profile for Transamerica FFIUL II policy form ICC24 TPIU12IC-0224.'
    )
    returning id into v_profile_id;
  else
    update illustration_profiles
    set status = 'active',
        notes = case
          when notes = '' then 'Codex-trained published profile for Transamerica FFIUL II policy form ICC24 TPIU12IC-0224.'
          when notes like '%ICC24 TPIU12IC-0224%' then notes
          else notes || E'\nCodex-trained published profile for Transamerica FFIUL II policy form ICC24 TPIU12IC-0224.'
        end,
        updated_at = now()
    where id = v_profile_id;
  end if;

  select id, version_number
  into v_version_id, v_version_number
  from illustration_profile_versions
  where profile_id = v_profile_id
    and profile_config ->> 'codexProfileKey' = v_profile_key
  limit 1;

  if v_version_id is null then
    select coalesce(max(version_number), 0) + 1
    into v_version_number
    from illustration_profile_versions
    where profile_id = v_profile_id;

    insert into illustration_profile_versions (
      profile_id,
      version_number,
      status,
      schema_version,
      min_match_score,
      min_extraction_confidence,
      profile_config,
      training_summary,
      published_at
    ) values (
      v_profile_id,
      v_version_number,
      'published',
      1,
      0.8500,
      0.8000,
      jsonb_build_object(
        'codexProfileKey', v_profile_key,
        'policyForm', 'ICC24 TPIU12IC-0224',
        'profileScope', 'Transamerica FFIUL II IUL tabular detail layout'
      ),
      jsonb_build_object(
        'source', 'codex_training',
        'sampleFileName', 'Cindy Ngoc Phuong - 220K - 300 mo - Preferred.pdf',
        'sampleSha256', 'cef71684c591024a78d4570de167c0fe17e952a4060a6368853d9d49a3870a2e',
        'requiredFieldsPassed', true,
        'fingerprintsReady', true,
        'projectionRows', 70,
        'suggestedStatus', 'publish'
      ),
      v_published_at
    )
    returning id into v_version_id;
  else
    update illustration_profile_versions
    set status = 'published',
        schema_version = 1,
        min_match_score = 0.8500,
        min_extraction_confidence = 0.8000,
        profile_config = jsonb_build_object(
          'codexProfileKey', v_profile_key,
          'policyForm', 'ICC24 TPIU12IC-0224',
          'profileScope', 'Transamerica FFIUL II IUL tabular detail layout'
        ),
        training_summary = jsonb_build_object(
          'source', 'codex_training',
          'sampleFileName', 'Cindy Ngoc Phuong - 220K - 300 mo - Preferred.pdf',
          'sampleSha256', 'cef71684c591024a78d4570de167c0fe17e952a4060a6368853d9d49a3870a2e',
          'requiredFieldsPassed', true,
          'fingerprintsReady', true,
          'projectionRows', 70,
          'suggestedStatus', 'publish'
        ),
        published_at = coalesce(published_at, v_published_at),
        updated_at = now()
    where id = v_version_id;
  end if;

  delete from illustration_profile_fingerprints
  where profile_id = v_profile_id
    and profile_version_id = v_version_id;

  insert into illustration_profile_fingerprints (
    profile_id,
    profile_version_id,
    fingerprint_type,
    match_strategy,
    value,
    page_hint,
    required,
    weight,
    confidence,
    evidence_snippet
  ) values
    (
      v_profile_id,
      v_version_id,
      'carrier',
      'contains',
      'Transamerica Life Insurance Company',
      1,
      true,
      1.0000,
      0.9500,
      'Transamerica Life Insurance Company'
    ),
    (
      v_profile_id,
      v_version_id,
      'product',
      'normalized_contains',
      'TRANSAMERICA FINANCIAL FOUNDATION IUL II',
      1,
      true,
      1.1500,
      0.9800,
      'TRANSAMERICA FINANCIAL FOUNDATION IUL II'
    ),
    (
      v_profile_id,
      v_version_id,
      'form',
      'contains',
      'Policy Form ICC24 TPIU12IC-0224',
      1,
      true,
      1.0000,
      0.9600,
      'Policy Form ICC24 TPIU12IC-0224'
    ),
    (
      v_profile_id,
      v_version_id,
      'text',
      'contains',
      'TABULAR DETAIL',
      8,
      true,
      0.9000,
      0.9300,
      'TABULAR DETAIL'
    ),
    (
      v_profile_id,
      v_version_id,
      'version',
      'contains',
      'Version: 3.16.6 S',
      null,
      false,
      0.2500,
      0.8500,
      'Version: 3.16.6 S'
    );

  delete from illustration_profile_field_mappings
  where profile_id = v_profile_id
    and profile_version_id = v_version_id;

  insert into illustration_profile_field_mappings (
    profile_id,
    profile_version_id,
    field_path,
    source_strategy,
    source_selector,
    transform_rules,
    required,
    min_confidence,
    notes
  ) values
    (
      v_profile_id,
      v_version_id,
      'carrier',
      'constant',
      '{"value":"Transamerica Life Insurance Company"}'::jsonb,
      '{}'::jsonb,
      true,
      1.0000,
      'Profile identity constant after required carrier/product/form fingerprints match.'
    ),
    (
      v_profile_id,
      v_version_id,
      'productName',
      'constant',
      '{"value":"Transamerica Financial Foundation IUL II"}'::jsonb,
      '{}'::jsonb,
      true,
      1.0000,
      'Profile identity constant after required carrier/product/form fingerprints match.'
    ),
    (
      v_profile_id,
      v_version_id,
      'productType',
      'constant',
      '{"value":"iul"}'::jsonb,
      '{}'::jsonb,
      true,
      1.0000,
      'Profile identity constant after required carrier/product/form fingerprints match.'
    ),
    (
      v_profile_id,
      v_version_id,
      'client.fullName',
      'regex',
      '{"regex":"Designed For:\\s*(?<value>[^\\n]+)"}'::jsonb,
      '{}'::jsonb,
      true,
      0.9000,
      'p1: Designed For: Cindy Ngoc Phuong.'
    ),
    (
      v_profile_id,
      v_version_id,
      'client.age',
      'regex',
      '{"regex":"(?:Female|Male),\\s*Age\\s*(?<value>\\d{1,3})"}'::jsonb,
      '{}'::jsonb,
      false,
      0.8500,
      'p2: Female, Age 51.'
    ),
    (
      v_profile_id,
      v_version_id,
      'client.gender',
      'regex',
      '{"regex":"(?<value>Female|Male),\\s*Age\\s*\\d{1,3}"}'::jsonb,
      '{"gender":true}'::jsonb,
      false,
      0.8500,
      'p2: Female, Age 51.'
    ),
    (
      v_profile_id,
      v_version_id,
      'client.state',
      'regex',
      '{"regex":"Issue State:\\s*(?<value>[A-Za-z ]+)"}'::jsonb,
      '{}'::jsonb,
      false,
      0.8500,
      'p2: Issue State: Wyoming.'
    ),
    (
      v_profile_id,
      v_version_id,
      'client.riskClass',
      'regex',
      '{"regex":"Risk Class:\\s*(?<value>[A-Za-z ]+)"}'::jsonb,
      '{}'::jsonb,
      false,
      0.8500,
      'p2: Risk Class: Preferred.'
    ),
    (
      v_profile_id,
      v_version_id,
      'policy.faceAmount',
      'regex',
      '{"regex":"Initial Face Amount:\\s*\\$?(?<value>[\\d,]+)"}'::jsonb,
      '{"currency":true}'::jsonb,
      true,
      0.9000,
      'p8: Initial Face Amount: $220,000.'
    ),
    (
      v_profile_id,
      v_version_id,
      'policy.monthlyPremium',
      'regex',
      '{"regex":"Initial Monthly Premium:\\s*\\$?(?<value>[\\d,.]+)"}'::jsonb,
      '{"currency":true}'::jsonb,
      true,
      0.9000,
      'p8: Initial Monthly Premium: $300.00.'
    ),
    (
      v_profile_id,
      v_version_id,
      'policy.premiumMode',
      'regex',
      '{"regex":"Initial\\s+(?<value>Monthly|Annual|Quarterly)\\s+Premium"}'::jsonb,
      '{}'::jsonb,
      false,
      0.8200,
      'p2/p8: Initial Monthly Premium.'
    ),
    (
      v_profile_id,
      v_version_id,
      'policy.illustratedRate',
      'regex',
      '{"regex":"CURRENT PROJECTIONS[\\s\\S]{0,160}?Interest Rate\\s+[^%\\n]+%\\s+Interest Rate\\s+[^%\\n]+%\\s+Interest Rate\\s+(?<value>\\d+(?:\\.\\d+)?)%"}'::jsonb,
      '{"percent":true}'::jsonb,
      false,
      0.8800,
      'p8: CURRENT PROJECTIONS Interest Rate 7.80%.'
    ),
    (
      v_profile_id,
      v_version_id,
      'policy.payYears',
      'regex',
      '{"regex":"Planned Periodic Premiums\\s+[\\d,.]+\\s+From\\s+\\d+\\s+To\\s+(?<value>\\d+)"}'::jsonb,
      '{}'::jsonb,
      false,
      0.8200,
      'p36: Planned Periodic Premiums 300.00 From 1 To 20.'
    ),
    (
      v_profile_id,
      v_version_id,
      'agent.name',
      'regex',
      '{"regex":"Agent/Representative:\\s*(?<value>[^\\n]+)"}'::jsonb,
      '{}'::jsonb,
      false,
      0.8200,
      'p1: Agent/Representative: Ms. Regina Dang.'
    ),
    (
      v_profile_id,
      v_version_id,
      'agent.phone',
      'regex',
      '{"regex":"(?<value>\\(\\d{3}\\)\\s*\\d{3}-\\d{4})"}'::jsonb,
      '{"phone":true}'::jsonb,
      false,
      0.8200,
      'p1: (949) 556-7999.'
    );

  delete from illustration_profile_projection_mappings
  where profile_id = v_profile_id
    and profile_version_id = v_version_id;

  insert into illustration_profile_projection_mappings (
    profile_id,
    profile_version_id,
    projection_key,
    source_strategy,
    row_selector,
    column_mappings,
    value_mappings,
    transform_rules,
    required,
    min_confidence,
    notes
  ) values (
    v_profile_id,
    v_version_id,
    'iul_tabular_detail_current',
    'table',
    '{"regex":"^(?<year>\\d{1,3})(?:\\s+\\d{1,3}){0,3}\\s+(?<age>\\d{1,3})(?:\\s+\\d{1,3}){0,3}\\s+.*\\s(?<policyValue>[\\d,]+)\\s+(?<cashSurrenderValue>[\\d,]+)\\s+(?<deathBenefit>[\\d,]+)$"}'::jsonb,
    '{}'::jsonb,
    '{}'::jsonb,
    '{"currency":true}'::jsonb,
    false,
    0.8800,
    'Captures current projection columns from Transamerica FFIUL II tabular detail rows.'
  );
end $$;
