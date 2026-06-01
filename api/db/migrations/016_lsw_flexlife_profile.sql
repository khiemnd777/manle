do $$
declare
  v_profile_id uuid;
  v_version_id uuid;
  v_version_number integer;
  v_profile_key text := 'lsw_flexlife_icc19_20608_0119_r26';
  v_published_at timestamptz := '2026-06-01 00:00:00+00'::timestamptz;
begin
  select id
  into v_profile_id
  from illustration_profiles
  where lower(carrier) = lower('Life Insurance Company of the Southwest')
    and lower(product_name) = lower('FlexLife')
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
      'Life Insurance Company of the Southwest',
      'FlexLife',
      'iul',
      'active',
      'Codex-trained published profile for LSW FlexLife form ICC19-20608(0119), 2025 Series R26.'
    )
    returning id into v_profile_id;
  else
    update illustration_profiles
    set status = 'active',
        notes = case
          when notes = '' then 'Codex-trained published profile for LSW FlexLife form ICC19-20608(0119), 2025 Series R26.'
          when notes like '%ICC19-20608(0119)%' then notes
          else notes || E'\nCodex-trained published profile for LSW FlexLife form ICC19-20608(0119), 2025 Series R26.'
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
        'policyForm', 'ICC19-20608(0119)',
        'illustrationSeries', '2025 Series R26',
        'profileScope', 'LSW FlexLife indexed universal life current-ledger layout'
      ),
      jsonb_build_object(
        'source', 'codex_training',
        'sampleFileName', 'Lauren Nguyen - Life Insurance Company of the Southwest FlexLife - 20 Pay - Monthly - User Download.pdf',
        'sampleSha256', '615f69c603976b635f829cbc307dc47e3122e730f8b9c1b32d43a7f9902fe84c',
        'requiredFieldsPassed', true,
        'fingerprintsReady', true,
        'projectionRows', 93,
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
          'policyForm', 'ICC19-20608(0119)',
          'illustrationSeries', '2025 Series R26',
          'profileScope', 'LSW FlexLife indexed universal life current-ledger layout'
        ),
        training_summary = jsonb_build_object(
          'source', 'codex_training',
          'sampleFileName', 'Lauren Nguyen - Life Insurance Company of the Southwest FlexLife - 20 Pay - Monthly - User Download.pdf',
          'sampleSha256', '615f69c603976b635f829cbc307dc47e3122e730f8b9c1b32d43a7f9902fe84c',
          'requiredFieldsPassed', true,
          'fingerprintsReady', true,
          'projectionRows', 93,
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
      'Life Insurance Company of the Southwest',
      1,
      true,
      1.0000,
      0.9800,
      'Life Insurance Company of the Southwest'
    ),
    (
      v_profile_id,
      v_version_id,
      'product',
      'contains',
      'FlexLife',
      1,
      true,
      1.0000,
      0.9800,
      'FlexLife'
    ),
    (
      v_profile_id,
      v_version_id,
      'form',
      'contains',
      'Form Number ICC19-20608(0119)',
      1,
      true,
      1.0000,
      0.9400,
      'Form Number ICC19-20608(0119)'
    ),
    (
      v_profile_id,
      v_version_id,
      'text',
      'contains',
      'Indexed Universal Life',
      1,
      true,
      0.8000,
      0.9400,
      'FlexLife INDEXED UNIVERSAL LIFE'
    ),
    (
      v_profile_id,
      v_version_id,
      'version',
      'contains',
      '2025 Series R26',
      1,
      false,
      0.3000,
      0.7000,
      '2025 Series R26'
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
      '{"value":"Life Insurance Company of the Southwest"}'::jsonb,
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
      '{"value":"FlexLife"}'::jsonb,
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
      '{"pageHint":4,"regex":"Insured Information Name:\\s*(?<value>[A-Z][A-Za-z .-]+?)\\s+(?:Male|Female)\\s+\\d{1,3}"}'::jsonb,
      '{}'::jsonb,
      true,
      0.9000,
      'p4: Insured Information Name: Lauren Nguyen.'
    ),
    (
      v_profile_id,
      v_version_id,
      'client.age',
      'regex',
      '{"pageHint":4,"regex":"(?:Male|Female)\\s+(?<value>\\d{1,3})\\s+[A-Za-z -]+\\s+State:"}'::jsonb,
      '{}'::jsonb,
      false,
      0.8800,
      'p4: Female 28 Select Non-Tobacco.'
    ),
    (
      v_profile_id,
      v_version_id,
      'client.gender',
      'regex',
      '{"pageHint":4,"regex":"(?<value>Male|Female)\\s+\\d{1,3}\\s+[A-Za-z -]+\\s+State:"}'::jsonb,
      '{"gender":true}'::jsonb,
      false,
      0.8800,
      'p4: Female 28 Select Non-Tobacco.'
    ),
    (
      v_profile_id,
      v_version_id,
      'client.state',
      'regex',
      '{"pageHint":4,"regex":"State:\\s*(?<value>[A-Za-z ]+?)\\s+Life Insurance"}'::jsonb,
      '{}'::jsonb,
      false,
      0.8600,
      'p4: State: Texas.'
    ),
    (
      v_profile_id,
      v_version_id,
      'client.riskClass',
      'regex',
      '{"pageHint":4,"regex":"(?:Male|Female)\\s+\\d{1,3}\\s+(?<value>[A-Za-z -]+?)\\s+State:"}'::jsonb,
      '{}'::jsonb,
      false,
      0.7800,
      'p4: Female 28 Select Non-Tobacco.'
    ),
    (
      v_profile_id,
      v_version_id,
      'policy.faceAmount',
      'regex',
      '{"pageHint":4,"regex":"Death Protection\\s+\\$?(?<value>\\d[\\d,]*)\\s+for"}'::jsonb,
      '{"currency":true}'::jsonb,
      true,
      0.9000,
      'p4: Death Protection $1,000,000 for Lauren Nguyen.'
    ),
    (
      v_profile_id,
      v_version_id,
      'policy.monthlyPremium',
      'regex',
      '{"pageHint":4,"regex":"Initial Premium:\\s*\\$?(?<value>[\\d,.]+)\\s+Monthly"}'::jsonb,
      '{"currency":true}'::jsonb,
      true,
      0.9000,
      'p4: Initial Premium: $637.00 Monthly.'
    ),
    (
      v_profile_id,
      v_version_id,
      'policy.premiumMode',
      'regex',
      '{"pageHint":4,"regex":"Initial Premium:\\s*\\$?[\\d,.]+\\s+(?<value>Monthly|Annual|Quarterly)"}'::jsonb,
      '{}'::jsonb,
      false,
      0.8600,
      'p4: Initial Premium: $637.00 Monthly.'
    ),
    (
      v_profile_id,
      v_version_id,
      'policy.illustratedRate',
      'regex',
      '{"pageHint":24,"regex":"Year Age Outlay Rate Value Value Benefit Rate Value Value Benefit\\s+\\d+\\s+\\d+\\s+\\$?[\\d,.]+\\s+\\d+(?:\\.\\d+)?\\s*%\\s+\\$?[\\d,]+\\s+\\$?[\\d,]+\\s+\\$?[\\d,]+\\s+(?<value>\\d+(?:\\.\\d+)?)\\s*%"}'::jsonb,
      '{"percent":true}'::jsonb,
      false,
      0.8400,
      'p24: Current Illustrated Values use 6.84%.'
    ),
    (
      v_profile_id,
      v_version_id,
      'policy.payYears',
      'filename',
      '{"regex":"(?<value>\\d{1,2})\\s*Pay"}'::jsonb,
      '{}'::jsonb,
      false,
      0.7200,
      'Filename: 20 Pay. PDF p8 also shows premium stops in policy year 21.'
    ),
    (
      v_profile_id,
      v_version_id,
      'agent.name',
      'regex',
      '{"pageHint":1,"regex":"Prepared on\\s+[A-Za-z]+\\s+\\d{1,2},\\s+\\d{4}\\s+(?<value>[A-Z][A-Za-z .-]+?)\\s+For\\s+"}'::jsonb,
      '{}'::jsonb,
      false,
      0.8000,
      'p1: Prepared on May 24, 2026 Tri Ngo.'
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
    'iul_ledger_current_values',
    'table',
    '{"regex":"^(?<year>\\d{1,3})\\s+(?<age>\\d{1,3})\\s+\\$?\\d[\\d,]*(?:\\.\\d{2})?\\s+.*\\b\\d+(?:\\.\\d+)?\\s*%\\s+\\$?(?<policyValue>\\d[\\d,]*)\\s+\\$?(?<cashSurrenderValue>\\d[\\d,]*)\\s+\\$?(?<deathBenefit>\\d[\\d,]*)$"}'::jsonb,
    '{}'::jsonb,
    '{}'::jsonb,
    '{"currency":true}'::jsonb,
    false,
    0.8800,
    'Captures current-side policy value, cash surrender value, and death benefit from LSW FlexLife ledger rows.'
  );
end $$;
