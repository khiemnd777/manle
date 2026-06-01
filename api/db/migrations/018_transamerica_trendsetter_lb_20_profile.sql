do $$
declare
  v_profile_id uuid;
  v_version_id uuid;
  v_version_number integer;
  v_profile_key text := 'transamerica_trendsetter_lb_20_icc16_tl23';
  v_published_at timestamptz := '2026-06-01 00:00:00+00'::timestamptz;
begin
  select id
  into v_profile_id
  from illustration_profiles
  where lower(carrier) = lower('Transamerica Life Insurance Company')
    and lower(product_name) = lower('Transamerica Trendsetter LB 20')
    and product_type = 'term'
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
      'Transamerica Trendsetter LB 20',
      'term',
      'active',
      'Codex-trained published profile for Transamerica Trendsetter LB 20 term quote form ICC16 TL23.'
    )
    returning id into v_profile_id;
  else
    update illustration_profiles
    set status = 'active',
        notes = case
          when notes = '' then 'Codex-trained published profile for Transamerica Trendsetter LB 20 term quote form ICC16 TL23.'
          when notes like '%ICC16 TL23%' then notes
          else notes || E'\nCodex-trained published profile for Transamerica Trendsetter LB 20 term quote form ICC16 TL23.'
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
        'policyForm', 'ICC16 TL23',
        'softwareVersion', '3.15.0 S',
        'profileScope', 'Transamerica Trendsetter LB 20 guaranteed level term quote layout'
      ),
      jsonb_build_object(
        'source', 'codex_training',
        'sampleFileName', 'Term - Thi Be Thao Dao - $300,000 - $19.35 - 20Y.pdf',
        'sampleSha256', '41f9f9245bfddbbfd3c29908f43deb096a6011fb218ba991bd8f4a1fa7f8e75c',
        'requiredFieldsPassed', true,
        'fingerprintsReady', true,
        'projectionRows', 0,
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
          'policyForm', 'ICC16 TL23',
          'softwareVersion', '3.15.0 S',
          'profileScope', 'Transamerica Trendsetter LB 20 guaranteed level term quote layout'
        ),
        training_summary = jsonb_build_object(
          'source', 'codex_training',
          'sampleFileName', 'Term - Thi Be Thao Dao - $300,000 - $19.35 - 20Y.pdf',
          'sampleSha256', '41f9f9245bfddbbfd3c29908f43deb096a6011fb218ba991bd8f4a1fa7f8e75c',
          'requiredFieldsPassed', true,
          'fingerprintsReady', true,
          'projectionRows', 0,
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
      0.9800,
      'Transamerica Life Insurance Company'
    ),
    (
      v_profile_id,
      v_version_id,
      'product',
      'contains',
      'TRANSAMERICA TRENDSETTER LB 20',
      1,
      true,
      1.0000,
      0.9800,
      'TRANSAMERICA TRENDSETTER LB 20'
    ),
    (
      v_profile_id,
      v_version_id,
      'form',
      'contains',
      'Policy Form ICC16 TL23',
      1,
      true,
      1.0000,
      0.9500,
      'Policy Form ICC16 TL23'
    ),
    (
      v_profile_id,
      v_version_id,
      'text',
      'contains',
      'Guaranteed Level Term Life Insurance with Living Benefits',
      1,
      true,
      0.9000,
      0.9500,
      'Guaranteed Level Term Life Insurance with Living Benefits'
    ),
    (
      v_profile_id,
      v_version_id,
      'version',
      'contains',
      'Ver: 3.15.0 S',
      2,
      false,
      0.2500,
      0.7200,
      'Ver: 3.15.0 S'
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
      '{"value":"Transamerica Trendsetter LB 20"}'::jsonb,
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
      '{"value":"term"}'::jsonb,
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
      '{"pageHint":1,"regex":"Designed For:\\s*(?<value>[^\\n]+)"}'::jsonb,
      '{}'::jsonb,
      true,
      0.9000,
      'p1: Designed For: Thi Be Thao Dao.'
    ),
    (
      v_profile_id,
      v_version_id,
      'client.age',
      'regex',
      '{"pageHint":2,"regex":"(?:Male|Female),\\s*Age\\s*(?<value>\\d{1,3})"}'::jsonb,
      '{}'::jsonb,
      false,
      0.8800,
      'p2: Female, Age 33.'
    ),
    (
      v_profile_id,
      v_version_id,
      'client.gender',
      'regex',
      '{"pageHint":2,"regex":"(?<value>Male|Female),\\s*Age\\s*\\d{1,3}"}'::jsonb,
      '{"gender":true}'::jsonb,
      false,
      0.8800,
      'p2: Female, Age 33.'
    ),
    (
      v_profile_id,
      v_version_id,
      'client.state',
      'regex',
      '{"pageHint":2,"regex":"Issue State:\\s*(?<value>[A-Za-z ]+)"}'::jsonb,
      '{}'::jsonb,
      false,
      0.8600,
      'p2: Issue State: Maryland.'
    ),
    (
      v_profile_id,
      v_version_id,
      'client.riskClass',
      'regex',
      '{"pageHint":2,"regex":"Risk Class:\\s*(?<value>(?:Preferred|Standard)(?:\\s+(?:Plus|Elite))?)"}'::jsonb,
      '{}'::jsonb,
      false,
      0.8600,
      'p2: Risk Class: Preferred Plus.'
    ),
    (
      v_profile_id,
      v_version_id,
      'policy.faceAmount',
      'regex',
      '{"pageHint":3,"regex":"Initial Face Amount:\\s*\\$?(?<value>\\d[\\d,]*)"}'::jsonb,
      '{"currency":true}'::jsonb,
      true,
      0.9000,
      'p3: Initial Face Amount: $300,000.'
    ),
    (
      v_profile_id,
      v_version_id,
      'policy.monthlyPremium',
      'regex',
      '{"pageHint":6,"regex":"Base Policy\\s+\\$[\\d,.]+\\s+\\$[\\d,.]+\\s+\\$[\\d,.]+\\s+\\$?(?<value>[\\d,.]+)"}'::jsonb,
      '{"currency":true}'::jsonb,
      false,
      0.8800,
      'p6: Base Policy $225.00 $114.75 $57.94 $19.35.'
    ),
    (
      v_profile_id,
      v_version_id,
      'policy.premiumMode',
      'regex',
      '{"pageHint":3,"regex":"Premium Mode:\\s*(?<value>Monthly|Annual|Quarterly)"}'::jsonb,
      '{}'::jsonb,
      false,
      0.8600,
      'p3: Premium Mode: Monthly.'
    ),
    (
      v_profile_id,
      v_version_id,
      'policy.termLength',
      'regex',
      '{"pageHint":6,"regex":"Term Duration\\s*-\\s*(?<value>\\d{1,3})\\s*years?"}'::jsonb,
      '{}'::jsonb,
      true,
      0.9000,
      'p6: Term Duration - 20 years.'
    ),
    (
      v_profile_id,
      v_version_id,
      'agent.name',
      'regex',
      '{"pageHint":1,"regex":"Agent/Representative:\\s*(?<value>[^\\n]+)"}'::jsonb,
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
      '{"pageHint":1,"regex":"(?<value>\\(\\d{3}\\)\\s*\\d{3}-\\d{4})"}'::jsonb,
      '{"phone":true}'::jsonb,
      false,
      0.8200,
      'p1: (949) 554-7999.'
    );

  delete from illustration_profile_projection_mappings
  where profile_id = v_profile_id
    and profile_version_id = v_version_id;
end $$;
